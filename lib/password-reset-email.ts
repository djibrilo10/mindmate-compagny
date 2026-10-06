import { isLocale, type Locale } from "./i18n/config";
import { dictionaries } from "./i18n/dictionaries";
import { createTranslator } from "./i18n/translator";
import { escapeHtml, type EmailMessage } from "./email";

// Courriel « Réinitialiser ton mot de passe » (AUDIT.md 7.35), dans la langue
// de la personne (sinon celle de son entreprise).

export function buildPasswordResetEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  url: string;
  locale: string | null | undefined;
  fallbackLocale: string | null | undefined;
}): EmailMessage {
  const locale: Locale = isLocale(params.locale)
    ? params.locale
    : isLocale(params.fallbackLocale)
      ? params.fallbackLocale
      : "fr";
  const { t } = createTranslator(locale, dictionaries[locale]);
  const vars = { name: params.firstName, organization: params.organizationName };

  const subject = t("email.reset.subject");
  const greeting = t("email.reset.greeting", vars);
  const intro = t("email.reset.intro", vars);
  const button = t("email.reset.button");
  const expires = t("email.reset.expires");
  const ignore = t("email.reset.ignore");
  const footer = t("email.reset.footer");

  const text = `${greeting}\n\n${intro}\n\n${params.url}\n\n${expires}\n${ignore}\n\n— ${footer}`;

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:0;background:#F5F6F8;font-family:Arial,Helvetica,sans-serif;color:#1C2438;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6F8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;padding:32px;">
          <tr><td style="font-size:18px;font-weight:bold;color:#2F6F5E;padding-bottom:20px;">Mindmate Compagny</td></tr>
          <tr><td style="font-size:15px;line-height:1.5;padding-bottom:12px;">${escapeHtml(greeting)}</td></tr>
          <tr><td style="font-size:15px;line-height:1.5;padding-bottom:24px;">${escapeHtml(intro)}</td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${escapeHtml(params.url)}" style="display:inline-block;background:#2F6F5E;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:10px;">${escapeHtml(button)}</a>
          </td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#5B6478;padding-bottom:6px;">${escapeHtml(expires)}</td></tr>
          <tr><td style="font-size:13px;line-height:1.5;color:#5B6478;padding-bottom:20px;">${escapeHtml(ignore)}</td></tr>
          <tr><td style="font-size:12px;line-height:1.5;color:#9AA3B5;word-break:break-all;">${escapeHtml(params.url)}</td></tr>
        </table>
        <p style="font-size:12px;color:#9AA3B5;margin-top:16px;">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to: params.to, subject, text, html };
}
