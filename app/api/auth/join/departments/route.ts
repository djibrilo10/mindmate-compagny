import { prisma } from "@/lib/prisma";
import { normalizeInviteCode } from "@/lib/invite-code";
import { HOUR, clientIp, consume, tooManyRequests } from "@/lib/rate-limit";

// GET /api/auth/join/departments?code=XXXX-XXXX -> nom de l'entreprise et
// départements proposés par l'admin, pour le formulaire « Rejoindre »
// (AUDIT.md 7.34). Route PUBLIQUE comme /api/auth/join : ne renvoie que des
// noms de départements, et seulement à qui possède un code valide.
export async function GET(request: Request) {
  // Empêche de deviner des codes d'invitation à la chaîne (AUDIT.md 7.49).
  if (!(await consume(`joincode:ip:${clientIp(request.headers)}`, 30, HOUR))) return tooManyRequests();
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const normalized = normalizeInviteCode(code);
  if (normalized.length < 4) return Response.json({ error: "invalid" }, { status: 404 });

  const organization = await prisma.organization.findUnique({
    where: { inviteCode: normalized },
    select: { name: true, status: true, departments: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
  });
  if (!organization || organization.status === "SUSPENDED") {
    return Response.json({ error: "invalid" }, { status: 404 });
  }
  return Response.json({ organizationName: organization.name, departments: organization.departments });
}
