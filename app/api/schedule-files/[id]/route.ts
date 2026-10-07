import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { canManageScheduleFileFor, isPreviewable, visibleScheduleFilesWhere } from "@/lib/schedule-files";

// ------------------------------------------------------------
// GET /api/schedule-files/[id]    -> ouvrir / télécharger le fichier
// DELETE /api/schedule-files/[id] -> le retirer (admin, ou responsable du
// département visé). AUDIT.md 7.39.
// Une personne qui n'a pas le droit de voir le fichier reçoit « introuvable »
// (son existence n'est pas révélée).
// ------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const file = await prisma.scheduleFile.findFirst({
      where: { AND: [{ id }, await visibleScheduleFilesWhere(ctx)] },
      select: { fileName: true, mimeType: true, fileSize: true, data: true },
    });
    if (!file) return Response.json({ error: "schedule.upload.errors.notFound" }, { status: 404 });

    const encodedName = encodeURIComponent(file.fileName);
    // PDF et images : affichés directement ; Excel/Word : téléchargés (le
    // téléphone les ouvre ensuite dans l'application adaptée).
    const disposition = isPreviewable(file.mimeType) ? "inline" : "attachment";
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.fileSize),
        "Content-Disposition": `${disposition}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[schedule-files:get]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const file = await prisma.scheduleFile.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, departmentId: true, week: true, fileName: true },
    });
    if (!file || !(await canManageScheduleFileFor(ctx, file.departmentId))) {
      return Response.json({ error: "schedule.upload.errors.notFound" }, { status: 404 });
    }

    await prisma.scheduleFile.delete({ where: { id: file.id } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SCHEDULE_FILE_DELETED",
        targetId: file.id,
        metadata: { week: file.week, fileName: file.fileName },
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[schedule-files:delete]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
