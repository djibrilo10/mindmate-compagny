import { prisma } from "@/lib/prisma";
import { demoRequestSchema } from "@/lib/validations/demo-request";
import { getLocale } from "@/lib/i18n/server";
import { escapeHtml, sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";
import { buildDemoRequestConfirmation, sendQuietly } from "@/lib/onboarding-emails";
import { appBaseUrl } from "@/lib/password-reset";

// ------------------------------------------------------------
// POST /api/demo-request (PUBLIC, AUDIT.md 7.43)
// Formulaire « Demander une démo » de la page d'accueil :
// 1. enregistré (DemoRequest) -> visible dans /platform/demo-requests ;
// 2. courriel au(x) propriétaire(s) de la plateforme (SUPER_ADMIN) ;
// 3. notification dans leur espace.
// Anti-abus : champ piège `website` (rempli = robot, on fait semblant
// d'accepter) et au plus 3 demandes par courriel en 24 h, 30 au total par heure.
// ------------------------------------------------------------

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = demoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
  }
  const data = parsed.data;
  if (data.website) return Response.json({ ok: true });

  try {
    const now = Date.now();
    const [sameEmail, lastHour] = await Promise.all([
      prisma.demoRequest.count({ where: { email: data.email, createdAt: { gte: new Date(now - 24 * 3600_000) } } }),
      prisma.demoRequest.count({ where: { createdAt: { gte: new Date(now - 3600_000) } } }),
    ]);
    if (sameEmail >= 3 || lastHour >= 30) {
      return Response.json({ error: "landing.form.errors.tooMany" }, { status: 429 });
    }

    const locale = await getLocale();
    const saved = await prisma.demoRequest.create({
      data: {
        name: data.name,
        company: data.company,
        email: data.email,
        phone: data.phone || null,
        companySize: data.companySize || null,
        message: data.message || null,
        locale,
      },
      select: { id: true },
    });

    const owners = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true, organizationId: true, email: true },
    });

    const lines = [
      `Nom : ${data.name}`,
      `Entreprise : ${data.company}`,
      `Courriel : ${data.email}`,
      `Téléphone : ${data.phone || "—"}`,
      `Employés : ${data.companySize || "—"}`,
      `Langue : ${locale === "en" ? "anglais" : "français"}`,
      "",
      data.message ? `Message :\n${data.message}` : "Aucun message.",
    ];
    const html = `<p><strong>Nouvelle demande de démo</strong></p><p>${lines
      .slice(0, 6)
      .map((l) => escapeHtml(l))
      .join("<br>")}</p><p>${data.message ? escapeHtml(data.message).replace(/\n/g, "<br>") : "Aucun message."}</p>`;

    await Promise.all(
      owners.map(async (owner) => {
        if (owner.email) {
          await sendEmail({
            to: owner.email,
            subject: `Demande de démo : ${data.company}`,
            text: `Nouvelle demande de démo\n\n${lines.join("\n")}`,
            html,
          });
        }
        await notifyUser(owner.organizationId, owner.id, {
          type: "DEMO_REQUEST_RECEIVED",
          title: `Demande de démo : ${data.company}`,
          body: `${data.name} · ${data.email}${data.companySize ? ` · ${data.companySize} employés` : ""}`,
          link: "/platform/demo-requests",
        }).catch((e) => console.error("[demo-request] notification non envoyée", e));
      })
    );

    // Confirmation à la personne, avec le lien vers la démo (AUDIT.md 7.46).
    await sendQuietly(
      buildDemoRequestConfirmation({ to: data.email, name: data.name, company: data.company, baseUrl: appBaseUrl(request), locale }),
      "confirmation de demande de démo"
    );

    return Response.json({ ok: true, id: saved.id }, { status: 201 });
  } catch (error) {
    console.error("[demo-request]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
