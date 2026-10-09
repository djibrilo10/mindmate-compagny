import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";

// PATCH /api/platform/demo-requests/[id] { handled: boolean } (AUDIT.md 7.43)
// Le propriétaire marque une demande de démo comme traitée (ou non).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["SUPER_ADMIN"]);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const handled = body?.handled === true;
    const res = await prisma.demoRequest.updateMany({
      where: { id },
      data: { handledAt: handled ? new Date() : null },
    });
    if (res.count === 0) return Response.json({ error: "Demande introuvable" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[platform:demo-requests]", error);
    return Response.json({ error: "Erreur du serveur" }, { status: 500 });
  }
}
