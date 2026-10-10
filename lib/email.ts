// ------------------------------------------------------------
// Envoi de courriels transactionnels (voir AUDIT.md 7.35).
//
// Fournisseur : Resend (https://resend.com), appelé directement par son API
// HTTP — aucune dépendance npm à ajouter. Variables d'environnement :
//   RESEND_API_KEY  clé API Resend (Vercel > Settings > Environment Variables)
//   EMAIL_FROM      expéditeur, ex. "Mindmate Compagny <no-reply@mindmatecompagny.com>"
//                   (le domaine doit être vérifié dans Resend)
//
// Sans RESEND_API_KEY (ex. en local), le courriel n'est PAS envoyé : son
// contenu est affiché dans le terminal de `npm run dev`, ce qui permet de
// tester le parcours complet sans compte Resend.
// ------------------------------------------------------------

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const DEFAULT_FROM = "Mindmate Compagny <no-reply@mindmatecompagny.com>";

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Le contenu (qui peut contenir un lien de réinitialisation) n'est
    // affiché qu'en développement, jamais dans les journaux de production (AUDIT.md 7.49).
    console.info(
      process.env.NODE_ENV === "production"
        ? `[email] RESEND_API_KEY absente : courriel NON envoyé (objet : ${message.subject}).`
        : `[email] RESEND_API_KEY absente : courriel NON envoyé.\nÀ : ${message.to}\nObjet : ${message.subject}\n\n${message.text}`
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend a refusé l'envoi :", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] Échec de l'envoi :", error);
    return false;
  }
}

/** Échappe le texte inséré dans le HTML d'un courriel. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
