import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { route } from '@/services/api';
import { applyUnsubscribe, verifyUnsubscribeToken } from '@/services/unsubscribe';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  /api/v1/settings/unsubscribe                                          │
// │                                                                         │
// │  Stops non-essential email for the account a link was minted for.       │
// │                                                                         │
// │  There is no session here on purpose: the request comes from someone's  │
// │  mail client, which has never signed in. The link authenticates itself  │
// │  with a signed, account-bound token (see services/unsubscribe.ts), so   │
// │  it can only ever change the mail settings of the account it names.     │
// │                                                                         │
// │  GET renders a confirmation page and changes nothing — mail clients and │
// │  security scanners follow links in messages before a human does, and a  │
// │  page that unsubscribed someone as a side effect of being scanned would │
// │  be a bug that nobody could reproduce. POST is what actually applies    │
// │  the change, both from that page's button and from a mail client's      │
// │  native one-click button (RFC 8058).                                    │
// │                                                                         │
// │  This used to require a signed-in session and revoke every refresh      │
// │  token; both were wrong. A mail client cannot present a session, and    │
// │  unsubscribing from updates is not a reason to sign someone out.        │
// └─────────────────────────────────────────────────────────────────────────┘

const PURPOSES_STOPPED = 'Revisio product updates and non-essential email notifications';

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Revisio</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;background:#faf8f4;color:#1c1a17">
  <main style="max-width:520px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e6e1d7;border-radius:12px">
    <h1 style="font-size:1.25rem;margin:0 0 12px">${title}</h1>
    ${body}
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex',
    },
  });
}

const INVALID_PAGE = () => page(
  'That unsubscribe link is no longer valid',
  `<p>Unsubscribe links are tied to the moment they were sent, and this one has expired or been altered.</p>
   <p>You can change what we send you at any time in <a href="/settings">your settings</a>.</p>`,
  400,
);

async function tokenFrom(req: NextRequest): Promise<string> {
  const fromQuery = req.nextUrl.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const body = await req.text().catch(() => '');
  return new URLSearchParams(body).get('token') ?? '';
}

/** GET — show the confirmation page. Never changes stored preferences. */
export const GET = route(async (req: NextRequest) => {
  const token = await tokenFrom(req);
  const secret = process.env.AUTH_SECRET;
  const verified = secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!verified) return INVALID_PAGE();

  return page(
    'Stop these emails?',
    `<p>This will turn off ${PURPOSES_STOPPED} for this account. Messages about your account itself — verification, password resets — keep arriving.</p>
     <form method="post" action="/api/v1/settings/unsubscribe" style="margin:20px 0 0">
       <input type="hidden" name="token" value="${token.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}">
       <button type="submit" style="min-height:44px;padding:10px 18px;border:0;border-radius:10px;background:#1c1a17;color:#fff;font-size:1rem;cursor:pointer">
         Stop these emails
       </button>
     </form>
     <p style="margin-top:16px"><a href="/settings">Keep them and manage my choices instead</a></p>`,
  );
});

/** POST — apply the change. Also the RFC 8058 one-click target. */
export const POST = route(async (req: NextRequest) => {
  const token = await tokenFrom(req);
  const secret = process.env.AUTH_SECRET;
  const verified = secret ? verifyUnsubscribeToken(token, secret) : null;
  if (!verified) return INVALID_PAGE();

  const [row] = await db
    .select({ id: users.id, consent: users.consent })
    .from(users)
    .where(eq(users.id, verified.userId))
    .limit(1);
  if (!row) return INVALID_PAGE();

  const next = applyUnsubscribe(row.consent);
  await db
    .update(users)
    .set({ consent: next, consentUpdatedAt: new Date() })
    .where(eq(users.id, row.id));

  return page(
    'You are unsubscribed',
    `<p>We have turned off ${PURPOSES_STOPPED} for this account.</p>
     <p>Messages about your account itself — verification, password resets — still arrive, and you can turn anything back on in <a href="/settings">your settings</a>.</p>`,
  );
});
