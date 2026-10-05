/**
 * The whole-app smoke, against a real deployment.
 *
 *   npm run e2e:smoke                                       # production alias
 *   E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e:smoke   # a local build
 *   npm run e2e:headed                                      # watch it happen
 *
 * It walks the app the way a learner does — signs in through the actual form,
 * visits every screen, changes a profile field, and then checks from a *second
 * browser context* that the signed-out world sees what it should. That second
 * context is the point: a privacy feature only ever checked from inside the
 * session cannot tell "hidden" from "not implemented".
 *
 * What it deliberately does not do: submit a review, answer a card, change a
 * password, or touch any account but the probe. Everything it writes is
 * snapshotted first and restored in a `finally` (see lib/probe.ts).
 */
import { Suite, noHorizontalOverflow, settleText, signIn, waitForText } from './lib/browser';
import { ensureProbeAccount, restoreProfile, writeRestorePlan } from './lib/probe';

const baseUrl = process.env.E2E_BASE_URL ?? 'https://revisio-srs.vercel.app';
const suite = new Suite('whole-app', baseUrl);

const probe = await ensureProbeAccount();
writeRestorePlan(suite.artifacts, probe.snapshot);

try {
  const problems = await suite.run(async (suite, context) => {
    // ── signed out ────────────────────────────────────────────────────────
    // Its own context, so "signed out" means a cookie jar that never existed
    // rather than one somebody remembered to clear.
    const anon = await suite.newContext();
    await suite.withPage(anon, 'signed-out', async (page) => {
      await suite.step('the landing page and the sign-in form', async () => {
        await page.goto('/');
        await suite.check('/ serves a page', () => page.page.locator('body').isVisible());
        await suite.check('/ raised no page errors', () => page.findings.length === 0, () => firstFinding(page));
        await suite.screenshot('landing');

        await page.goto('/login');
        await suite.check('the login form renders', async () =>
          (await page.page.locator('#email').count()) === 1 && (await page.page.locator('#password').count()) === 1,
        );
        await suite.screenshot('login');
      });

      await suite.step('settings is not open to a stranger', async () => {
        await page.goto('/settings');
        await suite.check('/settings does not render the account form', async () =>
          (await page.page.locator('#set-name').count()) === 0,
        );
      });

      await suite.step('a public profile is open to a stranger', async () => {
        await page.goto(`/u/${probe.handle}`);
        const heading = page.page.locator('h1');
        await suite.check('the profile leads with a name', async () =>
          (await heading.count()) > 0 && (await heading.first().innerText()).trim().length > 0,
        );
        await suite.screenshot('public-profile-signed-out');
      });
    });

    // ── signed in ─────────────────────────────────────────────────────────
    await suite.withPage(context, 'signed-in', async (page) => {
      const p = page.page;

      await suite.step('sign in through the real form', async () => {
        const signedIn = await signIn(p, baseUrl, probe.email, probe.password);
        await suite.check('the dashboard is where sign-in lands', () => signedIn.ok, () => signedIn.why);
        await suite.screenshot('dashboard');
      });

      await suite.step('the dashboard lays out', async () => {
        const said = await settleText(p);
        await suite.check('the dashboard paints its content', () => said.painted, () => `only ${said.text.length} characters after 15s`);
        await suite.check('no horizontal overflow at 390px', () => noHorizontalOverflow(p, 'dashboard', 390));
        await suite.check('no horizontal overflow at 320px', () => noHorizontalOverflow(p, 'dashboard-320', 320));
      });

      await suite.step('the review queue answers', async () => {
        await page.goto('/review');
        // Wait for the queue's own words. The companion strip above every screen
        // means "the page has text" is true long before the queue has rendered.
        const said = await waitForText(p, /nothing due|due today|start review|cards? due|no cards/i);
        await suite.check('the review screen says what is due', () => said.matched, () => said.text.slice(-220));
        // Nothing is clicked here on purpose: answering moves a schedule and
        // awards XP, which is not this harness's business.
        await suite.screenshot('review');
        await suite.check('the review screen fits 390px', () => noHorizontalOverflow(p, 'review', 390));
      });

      await suite.step('progress has the four merged tabs', async () => {
        await page.goto('/progress');
        // Wait for a tab, not for text: the companion strip always has text.
        await p.getByRole('tab').first().waitFor({ timeout: 20_000 });
        await suite.check('there are four tabs, not five', async () => (await p.getByRole('tab').count()) === 4, async () =>
          `found ${(await p.getByRole('tab').allInnerTexts()).join(' | ')}`,
        );
        // The labels, not the ids: `rank / lobby / board / strength` are the internal
        // view ids, and the tabs a learner reads are Rank, This week, XP and
        // Strength. An earlier version of this suite asserted the ids and
        // reported two missing tabs on a screen that had all four.
        for (const tab of ['Rank', 'This week', 'XP', 'Strength']) {
          await suite.check(`the ${tab} tab is there`, async () => (await p.getByRole('tab', { name: tab, exact: true }).count()) > 0);
        }
        await suite.screenshot('progress');
        await suite.check('progress fits 390px', () => noHorizontalOverflow(p, 'progress', 390));
      });

      // ── the write path, and the privacy promise ──────────────────────────
      let saved = false;

      await suite.step('settings: choose pronouns with a chip', async () => {
        await page.goto('/settings');
        await p.waitForSelector('#set-pronouns', { timeout: 20_000 });
        const field = p.locator('#set-pronouns');
        const chip = p.getByRole('button', { name: 'they/them', exact: true });

        await chip.click();
        await suite.check('the chip fills the field', async () => (await field.inputValue()) === 'they/them', () => field.inputValue());
        await suite.check('the chip marks itself chosen', async () => (await chip.getAttribute('aria-pressed')) === 'true');
        await suite.check('the field says where it will be shown', async () => {
          const hint = (await p.locator('#set-pronouns-hint').innerText()).toLowerCase();
          return hint.includes('shown on your public profile') || hint.includes('private for now');
        }, 'the hint said neither "shown" nor "private"');
        await suite.screenshot('settings-pronouns');

        await p.getByRole('button', { name: /Save profile/ }).click();
        saved = await suite.check('the save confirms itself in place', async () => {
          await p.getByText('Profile saved.').first().waitFor({ timeout: 20_000 });
          return true;
        });
      });

      await suite.step('a visitor sees the pronouns while they are public', async () => {
        if (!saved) {
          // Not "the visitor sees it" — the pronouns were never saved, so the
          // check below would pass for the wrong reason.
          suite.skip('the visitor sees "they/them"', 'the save did not land, so there is nothing to show');
          return;
        }
        const stranger = await suite.newContext();
        await suite.withPage(stranger, 'visitor-public', async (visitor) => {
          await visitor.goto(`/u/${probe.handle}`);
          await suite.check('the visitor sees "they/them"', async () =>
            (await visitor.page.locator('body').innerText()).includes('they/them'),
          );
          await suite.screenshot('visitor-pronouns-public');
        });
      });

      await suite.step('hiding them changes the field and the visitor view, not the owner', async () => {
        await page.goto('/settings');
        await p.waitForSelector('#set-pronouns');
        await p.getByRole('switch', { name: 'Pronouns visible to visitors' }).click();
        await p.getByText('Privacy updated.').first().waitFor({ timeout: 20_000 });
        await suite.check('the field now says it is private', async () =>
          (await p.locator('#set-pronouns-hint').innerText()).toLowerCase().includes('private for now'),
        );
        await suite.check('the owner still sees their own pronouns', async () =>
          (await p.locator('#set-pronouns').inputValue()) === 'they/them',
        );
        await suite.screenshot('settings-pronouns-private');

        if (!saved) {
          suite.skip('the visitor does not see them', 'the save did not land, so hiding nothing proves nothing');
          return;
        }
        const stranger = await suite.newContext();
        await suite.withPage(stranger, 'visitor-hidden', async (visitor) => {
          await visitor.goto(`/u/${probe.handle}`);
          await suite.check('the visitor does not see them', async () =>
            !(await visitor.page.locator('body').innerText()).includes('they/them'),
          );
          await suite.screenshot('visitor-pronouns-hidden');
        });
      });

      await suite.step('making them public again works — a switch that only goes one way is not a control', async () => {
        await page.goto('/settings');
        await p.waitForSelector('#set-pronouns');
        await p.getByRole('switch', { name: 'Pronouns visible to visitors' }).click();
        await p.getByText('Privacy updated.').first().waitFor({ timeout: 20_000 });
        if (!saved) {
          suite.skip('the visitor sees them again', 'the save did not land, so nothing was ever public');
          return;
        }
        const stranger = await suite.newContext();
        await suite.withPage(stranger, 'visitor-restored', async (visitor) => {
          await visitor.goto(`/u/${probe.handle}`);
          await suite.check('the visitor sees them again', async () =>
            (await visitor.page.locator('body').innerText()).includes('they/them'),
          );
        });
      });
    });
  });

  if (problems > 0) process.exitCode = 1;
} finally {
  // The promise, kept even when a check threw: the probe account goes back to
  // exactly what it was, and the restore is verified rather than assumed.
  console.log('\nrestoring the probe account…');
  await restoreProfile(probe.snapshot);
  console.log('probe account restored');
}

function firstFinding(page: { findings: { kind: string; detail: string }[] }) {
  const first = page.findings[0];
  return first ? `${first.kind}: ${first.detail}` : 'no findings';
}