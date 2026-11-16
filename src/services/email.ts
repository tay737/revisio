import 'server-only';
import { Resend } from 'resend';
import { issueUnsubscribeToken } from '@/services/unsubscribe';

// ── Unsubscribe infrastructure ───────────────────────────────────────────────
//
// `unsubscribeUrl` mints a signed, account-bound link and `unsubscribeHeaders`
// wraps it in the headers a mailbox needs: `List-Unsubscribe` carries the URL,
// `List-Unsubscribe-Post: List-Unsubscribe=One-Click` tells the client it may
// POST that URL straight from its own button, and `Unsubscribe-Link` is the
// plain-URL fallback for clients that read neither. The link is a real
// capability — the token inside it is what authenticates the request, because a
// mail client has no session.
//
// **No sender here calls these yet, and that is correct.** Everything this
// module currently sends — verification, password reset, email change — is an
// essential service message the account cannot work without, so offering a way
// to stop it would be a lie and a footgun. The helpers exist so the first
// marketing or non-essential notification sender attaches the headers *with*
// the token rather than inventing a bare URL, and `scripts/verify-unsubscribe.ts`
// holds the token contract in the meantime.

function unsubscribeUrl(userId: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret?.trim()) return null;
  const token = issueUnsubscribeToken(userId, secret);
  return `${appUrl()}/api/v1/settings/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Headers for a non-essential message, or `{}` when no secret is configured. */
export function unsubscribeHeaders(userId: string): Record<string, string> {
  const url = unsubscribeUrl(userId);
  if (!url) return {};
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'Unsubscribe-Link': `<${url}>`,
  };
}

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
          <a href="${url}" style="background:#000000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;display:inline-block">Verify my email</a>
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

/** The one-hour link that moves a pending email address onto the account. */
/**
 * The 30-minute link that lets a learner set a new password after losing one.
 *
 * Always sent with the same neutral voice whether or not the account exists —
 * the caller decides that, and the email itself never confirms which.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = `${appUrl()}/reset-password?token=${token}`;
  const mailer = resend();
  if (!mailer) {
    console.log(`[email] (no RESEND_API_KEY — console mode) password-reset link for ${to}: ${url}`);
    return;
  }
  const { error } = await mailer.emails.send({
    from,
    to,
    subject: 'Reset your Revisio password',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="font-size:20px;font-weight:800;margin-bottom:16px">Revisio</div>
        <p style="color:#374151;line-height:1.6">Someone asked to reset the password for this address. If it was you:</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#000000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;display:inline-block">Choose a new password</a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">This link works once and expires in 30 minutes. If you didn't ask for it, ignore this email — your password is unchanged.</p>
      </div>`,
    text: `Reset your Revisio password: ${url} (single use, expires in 30 minutes). If you didn't ask for this, ignore the email.`,
  });
  if (error) {
    console.error(`[email] failed to send reset mail to ${to}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

export async function sendEmailChangeEmail(to: string, token: string): Promise<void> {
  const url = `${appUrl()}/verify-email?token=${token}&kind=email_change`;
  const mailer = resend();
  if (!mailer) {
    console.log(`[email] (no RESEND_API_KEY — console mode) email-change link for ${to}: ${url}`);
    return;
  }
  const { error } = await mailer.emails.send({
    from,
    to,
    subject: 'Confirm your new Revisio email',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="font-size:20px;font-weight:800;margin-bottom:16px">Revisio</div>
        <p style="color:#374151;line-height:1.6">Confirm this address to move your account here:</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#000000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;display:inline-block">Confirm new email</a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">This link expires in 24 hours. If you didn't request this, your account is unchanged — ignore the email.</p>
      </div>`,
    text: `Confirm your new Revisio email: ${url} (expires in 24 hours)`,
  });
  if (error) {
    console.error(`[email] failed to send change mail to ${to}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

/**
 * Non-essential retention mail (study queue, streak, season). Privacy-safe by
 * construction: the caller passes only generic title/body — never subject,
 * topic, question or answer text — and the unsubscribe headers let a mailbox
 * opt out without a session.
 */
export async function sendRetentionEmail(
  userId: string,
  to: string,
  input: { subject: string; title: string; body: string; ctaLabel?: string; ctaUrl?: string },
): Promise<void> {
  const mailer = resend();
  const url = input.ctaUrl ?? `${appUrl()}/dashboard`;
  const cta = input.ctaLabel ?? 'Open Revisio';
  if (!mailer) {
    console.log(`[email] (no RESEND_API_KEY — console mode) retention "${input.subject}" for ${to}: ${url}`);
    return;
  }
  const { error } = await mailer.emails.send({
    from,
    to,
    subject: input.subject,
    headers: unsubscribeHeaders(userId),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="font-size:20px;font-weight:800;margin-bottom:16px">Revisio</div>
        <p style="color:#111827;font-size:16px;font-weight:600;margin:0 0 8px">${escapeHtml(input.title)}</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 24px">${escapeHtml(input.body)}</p>
        <p style="margin:0 0 16px">
          <a href="${escapeHtml(url)}" style="background:#000000;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600;display:inline-block">${escapeHtml(cta)}</a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.6">You're getting this because you turned on study reminders. <a href="${escapeHtml(unsubscribeUrl(userId) ?? url)}" style="color:#6b7280">Turn them off</a> any time in Settings.</p>
      </div>`,
    text: `${input.title}\n\n${input.body}\n\n${cta}: ${url}\n\nYou're getting this because you turned on study reminders. Turn them off any time in Settings.`,
  });
  if (error) {
    console.error(`[email] failed to send retention mail to ${to}:`, error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
