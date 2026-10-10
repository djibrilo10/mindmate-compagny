import { isLocale, type Locale } from "./i18n/config";
import { dictionaries } from "./i18n/dictionaries";
import { createTranslator } from "./i18n/translator";
import { escapeHtml, sendEmail, type EmailMessage } from "./email";

// ------------------------------------------------------------
// Courriels d'accueil (AUDIT.md 7.46), dans la langue de la personne :
// - bienvenue à l'admin qui vient de créer son entreprise (/register) ;
// - confirmation à la personne qui demande une démo (/api/demo-request).
// Envoyés via Resend (lib/email.ts). Un échec d'envoi ne bloque jamais
// l'inscription ni la demande : il est seulement noté dans les journaux.
// ------------------------------------------------------------

function layout(locale: Locale, parts: { greeting: string; paragraphs: string[]; list?: string[]; listTitle?: string; button: string; url: string; small?: string[]; footer: string }) {
  const p = (text: string, style = "font-size:15px;line-height:1.5;padding-bottom:14px;") => `<tr><td style="${style}">${escapeHtml(text)}</td></tr>`;
  const list = parts.list?.length
    ? `${parts.listTitle ? p(parts.listTitle, "font-size:15px;font-weight:bold;line-height:1.5;padding-bottom:8px;") : ""}<tr><td style="padding-bottom:18px;"><ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.5;">${parts.list
        .map((item) => `<li style="padding-bottom:6px;">${escapeHtml(item)}</li>`)
        .join("")}</ol></td></tr>`
    : "";
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:0;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#1C2438;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;padding:32px;">
          <tr><td style="font-size:18px;font-weight:bold;color:#2F6F5E;padding-bottom:20px;">Mindmate Compagny</td></tr>
          ${p(parts.greeting)}
          ${parts.paragraphs.map((text) => p(text)).join("")}
          ${list}
          <tr><td align="center" style="padding:6px 0 22px;">
            <a href="${escapeHtml(parts.url)}" style="display:inline-block;background:#2F6F5E;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:10px;">${escapeHtml(parts.button)}</a>
          </td></tr>
          ${(parts.small ?? []).map((text) => p(text, "font-size:13px;line-height:1.5;color:#5B6478;padding-bottom:8px;")).join("")}
        </table>
        <p style="font-size:12px;color:#9AA3B5;margin-top:16px;">${escapeHtml(parts.footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

const pickLocale = (value: string | null | undefined): Locale => (isLocale(value) ? value : "fr");

export function buildWelcomeEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  slug: string;
  trialEndsAt: Date;
  baseUrl: string;
  locale: string | null | undefined;
}): EmailMessage {
  const locale = pickLocale(params.locale);
  const { t, formatDate } = createTranslator(locale, dictionaries[locale]);
  const vars = {
    name: params.firstName,
    organization: params.organizationName,
    slug: params.slug,
    date: formatDate(params.trialEndsAt.toISOString(), { day: "numeric", month: "long", year: "numeric" }),
  };
  const url = `${params.baseUrl}/login?slug=${encodeURIComponent(params.slug)}`;
  const greeting = t("email.welcome.greeting", vars);
  const intro = t("email.welcome.intro", vars);
  const stepsTitle = t("email.welcome.stepsTitle");
  const steps = [t("email.welcome.step1"), t("email.welcome.step2"), t("email.welcome.step3")];
  const loginInfo = t("email.welcome.loginInfo", vars);
  const help = t("email.welcome.help");
  const footer = t("email.welcome.footer");
  const button = t("email.welcome.button");

  const text = [greeting, "", intro, "", stepsTitle, ...steps.map((s, i) => `${i + 1}. ${s}`), "", `${button} : ${url}`, loginInfo, "", help, "", `— ${footer}`].join("\n");
  const html = layout(locale, { greeting, paragraphs: [intro], listTitle: stepsTitle, list: steps, button, url, small: [loginInfo, help], footer });
  return { to: params.to, subject: t("email.welcome.subject", vars), text, html };
}

export function buildDemoRequestConfirmation(params: { to: string; name: string; company: string; baseUrl: string; locale: string | null | undefined }): EmailMessage {
  const locale = pickLocale(params.locale);
  const { t } = createTranslator(locale, dictionaries[locale]);
  const vars = { name: params.name, company: params.company };
  const url = `${params.baseUrl}/#demo`;
  const greeting = t("email.demoRequest.greeting", vars);
  const intro = t("email.demoRequest.intro", vars);
  const tryNow = t("email.demoRequest.tryNow");
  const button = t("email.demoRequest.button");
  const footer = t("email.demoRequest.footer");

  const text = [greeting, "", intro, "", tryNow, `${button} : ${url}`, "", `— ${footer}`].join("\n");
  const html = layout(locale, { greeting, paragraphs: [intro, tryNow], button, url, footer });
  return { to: params.to, subject: t("email.demoRequest.subject"), text, html };
}

/** Envoie sans jamais lever d'erreur (l'appelant ne doit pas échouer pour ça). */
export async function sendQuietly(message: EmailMessage, label: string) {
  try {
    await sendEmail(message);
  } catch (error) {
    console.error(`[onboarding-email] ${label} non envoyé`, error);
  }
}
