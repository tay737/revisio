import 'server-only';
import { Resend } from 'resend';

// Email delivery. Uses Resend when RESEND_API_KEY is set; otherwise logs the
// link to the server console (local dev / self-host without SMTP).
//
// From address: RESEND_FROM (e.g. "Revisio <onboarding@resend.dev>") — a
// verified domain is required to send to arbitrary recipients in production.

const from = process.env.RESEND_FROM ?? 'Revisio <onboarding@resend.dev>';
let client: Resend | null = null;

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = `${appUrl()}/verify-email?token=${token}`;
  const mailer = resend();
  if (!mailer) {
    console.log(`[email] (no RESEND_API_KEY — console mode) verify link for ${to}: ${url}`);
    return;
  }
  const { error } = await mailer.emails.send({
    from,
    to,
    subject: 'Verify your Revisio account',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="font-size:20px;font-weight:800;margin-bottom:16px">Revisio</div>
        <p style="color:#374151;line-height:1.6">Welcome! Confirm your email address to activate your account:</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#1c64f2;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;display:inline-block">Verify my email</a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">This link expires in 24 hours. If you didn't create a Revisio account, you can ignore this email.</p>
      </div>`,
    text: `Welcome to Revisio! Verify your email: ${url} (expires in 24 hours)`,
  });
  if (error) {
    console.error(`[email] failed to send verification to ${to}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
