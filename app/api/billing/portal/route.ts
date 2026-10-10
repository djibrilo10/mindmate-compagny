import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { billingConfigured, stripeRequest, StripeError } from "@/lib/stripe";

// POST /api/billing/portal (AUDIT.md 7.45) -> { url } du portail client
// Stripe : changer de carte, voir et télécharger les factures, arrêter
// l'abonnement. Admin seulement, possible aussi pendant une suspension
// pour non-paiement.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth({ allowBillingSuspended: true });
    requireRole(ctx, ["ORG_ADMIN"]);
    if (!billingConfigured()) return Response.json({ error: "billing.errors.notConfigured" }, { status: 503 });

    const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { stripeCustomerId: true, isDemo: true } });
    if (!org?.stripeCustomerId || org.isDemo) return Response.json({ error: "billing.errors.noCustomer" }, { status: 400 });

    const session = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: org.stripeCustomerId,
      return_url: `${new URL(request.url).origin}/dashboard/settings#abonnement`,
    });
    return Response.json({ url: session.url });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[billing:portal]", error instanceof StripeError ? error.message : error);
    return Response.json({ error: "billing.errors.stripe" }, { status: 502 });
  }
}
