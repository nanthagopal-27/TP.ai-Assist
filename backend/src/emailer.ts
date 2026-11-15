/** Sends e-mail through any SMTP server (Gmail, Outlook / Office 365, company relay ...).
 *
 * Configure in backend-node/.env:
 *     SMTP_HOST=smtp.gmail.com
 *     SMTP_PORT=587
 *     SMTP_SECURITY=starttls        # starttls (port 587) | ssl (port 465) | none (internal relay, port 25)
 *     SMTP_USER=you@gmail.com
 *     SMTP_PASSWORD=app-password    # Gmail: create an "App password" (Google Account -> Security)
 *     SMTP_FROM=Orbit <you@gmail.com> */
import "dotenv/config";
import nodemailer from "nodemailer";

const env = (name: string, def = ""): string => (process.env[name] ?? def).trim();

export function configured(): boolean {
  return !!env("SMTP_HOST");
}

/** Raises a plain Error with a readable message on failure. */
export async function send(toAddr: string, subject: string, body: string): Promise<void> {
  const host = env("SMTP_HOST");
  if (!host) throw new Error("SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in backend/.env).");
  const security = env("SMTP_SECURITY", "starttls").toLowerCase();
  const port = parseInt(env("SMTP_PORT", security === "ssl" ? "465" : "587"), 10);
  const user = env("SMTP_USER");
  const password = process.env.SMTP_PASSWORD ?? "";
  const sender = env("SMTP_FROM") || user;
  if (!sender) throw new Error("Set SMTP_FROM (or SMTP_USER) in backend/.env.");

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: security === "ssl",
    auth: user ? { user, pass: password } : undefined,
  });

  try {
    await transporter.sendMail({ from: sender, to: toAddr, subject, text: body });
  } catch (exc) {
    const err = exc as { responseCode?: number; message?: string };
    if (err.responseCode === 535 || err.responseCode === 534) {
      throw new Error("The mail server rejected the login. Check SMTP_USER / SMTP_PASSWORD (Gmail needs an App password).");
    }
    throw new Error(`Could not send the e-mail: ${err.message ?? exc}`);
  }
}
