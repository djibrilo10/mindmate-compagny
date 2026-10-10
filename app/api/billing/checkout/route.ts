import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getLocale } from "@/lib/i18n/server";
import { billingConfigured, stripeRequest, StripeError } from "@/lib/stripe";
import { countBillableEmployees, isPaid } from "@/lib/billing";

// ------------------------------------------------------------
// POST /api/billing/checkout (AUDIT.md 7.45) -> { url } de la page de paiement
// Stripe Checkout (abonnement « par employé actif / mois »).
// Admin seulement ; possible même si l'entreprise est suspendue pour
// non-paiement (c'est justement comme ça qu'elle se réactive). Pendant
// l'essai gratuit, la carte est enregistrée et le 1er paiement a lieu à la
// fin de l'essai (trial_end).
// ------------------------------------------------------------

const MIN_TRIAL_LEFT_MS = 49 * 3600_000; // Stripe exige au moins 48 h

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth({ allowBillingSuspended: true });
    requireRole(ctx, ["ORG_ADMIN"]);
    if (!billingConfigured()) return Response.json({ error: "billing.errors.notConfigured" }, { status: 503 });

    const [org, me, locale] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { id: true, name: true, isDemo: true, trialEndsAt: true, stripeCustomerId: true, billingStatus: true, stripeSubscriptionId: true },
      }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }),
      getLocale(),
    ]);
    if (!org || org.isDemo) return Response.json({ error: "billing.errors.notAvailable" }, { status: 400 });
    if (org.stripeSubscriptionId && (isPaid(org.billingStatus) || org.billingStatus === "past_due")) {
      return Response.json({ error: "billing.errors.alreadySubscribed" }, { status: 409 });
    }

    const base = new URL(request.url).origin;
    const quantity = await countBillableEmployees(org.id);
    const trialLeft = org.trialEndsAt ? org.trialEndsAt.getTime() - Date.now() : 0;

    const session = await stripeRequest<{ url: string }>("POST", "/checkout/sessions", {
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity }],
      client_reference_id: org.id,
      metadata: { organizationId: org.id },
      subscription_data: {
        metadata: { organizationId: org.id },
        ...(trialLeft > MIN_TRIAL_LEFT_MS ? { trial_end: Math.floor(org.trialEndsAt!.getTime() / 1000) } : {}),
      },
      ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : me?.email ? { customer_email: me.email } : {}),
      allow_promotion_codes: true,
      locale: locale === "en" ? "en" : "fr-CA",
      success_url: `${base}/dashboard/settings?abonnement=merci#abonnement`,
      cancel_url: `${base}/dashboard/settings#abonnement`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[billing:checkout]", error instanceof StripeError ? error.message : error);
    return Response.json({ error: "billing.errors.stripe" }, { status: 502 });
  }
}
