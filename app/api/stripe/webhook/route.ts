import { stripeRequest, verifyStripeSignature, type StripeSubscription } from "@/lib/stripe";
import { applySubscription, markInvoicePaid, markPaymentFailed, type PaidInvoice } from "@/lib/billing";

// ------------------------------------------------------------
// POST /api/stripe/webhook (PUBLIC, AUDIT.md 7.45) — appelé par Stripe.
// Signature vérifiée avec STRIPE_WEBHOOK_SECRET (lib/stripe.ts) ; sans elle,
// tout est refusé. Hors du matcher du middleware (pas de session).
// Événements à cocher dans Stripe : checkout.session.completed,
// customer.subscription.created / updated / deleted, invoice.paid,
// invoice.payment_failed.
// ------------------------------------------------------------

export const dynamic = "force-dynamic";

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

const customerOf = (obj: Record<string, unknown>) =>
  typeof obj.customer === "string" ? obj.customer : (obj.customer as { id?: string } | null)?.id ?? null;

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"))) {
    return Response.json({ error: "Signature invalide" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return Response.json({ error: "Corps invalide" }, { status: 400 });
  }

  try {
    const obj = event.data.object;
    switch (event.type) {
      case "checkout.session.completed": {
        const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : null;
        const orgId =
          (obj.metadata as Record<string, string> | undefined)?.organizationId ?? (typeof obj.client_reference_id === "string" ? obj.client_reference_id : null);
        if (subscriptionId) {
          const sub = await stripeRequest<StripeSubscription>("GET", `/subscriptions/${subscriptionId}`);
          await applySubscription(sub, orgId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = obj as unknown as StripeSubscription;
        await applySubscription(event.type === "customer.subscription.deleted" ? { ...sub, status: "canceled" } : sub);
        break;
      }
      case "invoice.paid": {
        const customer = customerOf(obj);
        // + copie de la facture au propriétaire si le montant est > 0 (AUDIT.md 7.47).
        if (customer) await markInvoicePaid(customer, obj as unknown as PaidInvoice);
        break;
      }
      case "invoice.payment_failed": {
        const customer = customerOf(obj);
        if (customer) await markPaymentFailed(customer);
        break;
      }
      default:
        break; // autres événements : ignorés
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe:webhook]", event.type, error);
    // 500 -> Stripe réessaiera plus tard.
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
