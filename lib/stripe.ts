import { createHmac, timingSafeEqual } from "node:crypto";

// ------------------------------------------------------------
// Accès minimal à l'API Stripe (AUDIT.md 7.45), sans dépendance npm :
// requêtes HTTPS directes (form-encoded) + vérification de la signature des
// webhooks. Variables d'environnement (Vercel) :
//   STRIPE_SECRET_KEY      clé secrète (sk_test_… en test, sk_live_… en vrai)
//   STRIPE_PRICE_ID        prix « par employé actif / mois » (price_…)
//   STRIPE_WEBHOOK_SECRET  secret de signature du webhook (whsec_…)
// Tant que STRIPE_SECRET_KEY ou STRIPE_PRICE_ID manque, la facturation est
// considérée « non activée » : aucune carte demandée, aucune suspension auto.
// ------------------------------------------------------------

const API = "https://api.stripe.com/v1";

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

type Params = Record<string, unknown>;

/** { a: { b: 1 }, items: [{ price: "x" }] } -> a[b]=1&items[0][price]=x */
function encode(params: Params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") encode(v as Params, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof value === "object") {
      encode(value as Params, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export class StripeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function stripeRequest<T = Record<string, unknown>>(method: "GET" | "POST", path: string, params?: Params): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("STRIPE_SECRET_KEY manquante", 500);
  const body = params ? encode(params).toString() : undefined;
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data) {
    throw new StripeError(data?.error?.message ?? `Stripe a répondu ${res.status}`, res.status);
  }
  return data;
}

/**
 * Vérifie l'en-tête Stripe-Signature ("t=…,v1=…") d'un webhook : HMAC-SHA256
 * de "<t>.<corps brut>" avec STRIPE_WEBHOOK_SECRET, et horodatage récent
 * (5 minutes) pour bloquer les rejeux.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const buf = Buffer.from(sig, "hex");
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}

// Champs utilisés par l'app (les objets Stripe en ont beaucoup d'autres).
export type StripeSubscription = {
  id: string;
  customer: string;
  status: string; // trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
  current_period_end?: number;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items: { data: { id: string; quantity?: number; current_period_end?: number }[] };
};
