// Erzeugt die Mail-Vorlagen für die Anmeldung (Supabase Auth) im Firmen-Design.
// Farben und Name kommen aus packages/shared/src/brand.ts.
//
// Ausgabe ist JSON für die Supabase Management API:
//   node supabase/mail/vorlagen.mjs > vorlagen.json
//   curl -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
//     --data @vorlagen.json https://api.supabase.com/v1/projects/<ref>/config/auth
//
// Die Links zeigen fest auf das Büro-Web und nicht auf {{ .SiteURL }}: Die
// Vercel-Verknüpfung überschreibt die Site-URL in Supabase bei jedem Deploy.
import { brand } from "../../packages/shared/src/brand.ts";

const WEB = process.env.WEB_URL ?? "https://gebaeudereiniger-pro.vercel.app";
const LOGO = process.env.LOGO_URL ?? "https://gebaeudereiniger-pro-mobile.vercel.app/icon.png";
const c = brand.colors;
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function mail({ preheader, title, text, button, type, hint }) {
  const link = `${WEB}/auth/bestaetigen?token_hash={{ .TokenHash }}&type=${type}`;
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${c.background};">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${c.surface};border-radius:14px;overflow:hidden;border:1px solid ${c.line};">
  <tr><td style="background:${c.primary};padding:20px 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:12px;"><img src="${LOGO}" width="36" height="36" alt="" style="display:block;border-radius:8px;"></td>
      <td style="font-family:${font};font-size:18px;font-weight:700;color:${c.onPrimary};">${brand.name}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px 28px 8px;font-family:${font};color:${c.text};">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">${title}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;">${text}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <a href="${link}" style="display:inline-block;background:${c.signal};color:${c.onSignal};font-family:${font};font-size:15px;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:10px;">${button}</a>
  </td></tr>
  <tr><td style="padding:0 28px 28px;font-family:${font};font-size:13px;line-height:1.6;color:${c.muted};">
    ${hint ? `${hint}<br>` : ""}Der Link gilt eine Stunde und nur einmal.<br><br>
    Funktioniert der Knopf nicht? Dann kopiere diesen Link in deinen Browser:<br>
    <a href="${link}" style="color:${c.primary};word-break:break-all;">${link}</a>
  </td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
  <tr><td style="padding:16px 28px;font-family:${font};font-size:12px;line-height:1.6;color:${c.muted};text-align:center;">
    Diese Nachricht wurde automatisch von ${brand.name} versendet.<br>Bitte nicht auf diese E-Mail antworten.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const vorlagen = {
  recovery: {
    subject: "Neues Passwort festlegen",
    preheader: "Leg mit einem Klick ein neues Passwort fest.",
    title: "Neues Passwort festlegen",
    text: "Du hast ein neues Passwort angefordert. Klick auf den Knopf und leg dein neues Passwort fest.",
    button: "Neues Passwort festlegen",
    hint: "Du hast das nicht angefordert? Dann ignoriere diese E-Mail einfach. Dein Passwort bleibt unverändert.",
  },
  invite: {
    subject: `Willkommen bei ${brand.name}`,
    preheader: "Dein Zugang ist angelegt. Leg jetzt dein Passwort fest.",
    title: "Willkommen!",
    text: `Für dich wurde ein Zugang zu ${brand.name} angelegt. Klick auf den Knopf und leg dein Passwort fest. Danach kannst du dich anmelden.`,
    button: "Passwort festlegen",
  },
  confirmation: {
    subject: "Bitte bestätige deine E-Mail-Adresse",
    preheader: "Nur noch ein Klick, dann kann es losgehen.",
    title: "Fast geschafft",
    text: "Bitte bestätige deine E-Mail-Adresse. Danach kannst du direkt loslegen.",
    button: "E-Mail-Adresse bestätigen",
    type: "email",
  },
  magic_link: {
    subject: "Dein Anmelde-Link",
    preheader: "Melde dich mit einem Klick an.",
    title: "Anmelden",
    text: `Klick auf den Knopf, um dich bei ${brand.name} anzumelden.`,
    button: "Jetzt anmelden",
    type: "magiclink",
    hint: "Du wolltest dich nicht anmelden? Dann ignoriere diese E-Mail einfach.",
  },
  email_change: {
    subject: "Neue E-Mail-Adresse bestätigen",
    preheader: "Bestätige deine neue E-Mail-Adresse.",
    title: "Neue E-Mail-Adresse",
    text: "Bitte bestätige, dass du ab jetzt diese E-Mail-Adresse nutzen möchtest.",
    button: "Adresse bestätigen",
    type: "email_change",
  },
};

const out = {};
for (const [key, v] of Object.entries(vorlagen)) {
  out[`mailer_subjects_${key}`] = v.subject;
  out[`mailer_templates_${key}_content`] = mail({ ...v, type: v.type ?? key });
}
process.stdout.write(JSON.stringify(out, null, 2));
