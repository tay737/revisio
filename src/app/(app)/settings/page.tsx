'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useMe } from '@/lib/useMe';
import { Icon } from '@/components/ui/icons';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/Notice';
import { Avatar, ProfileBanner, AVATAR_COLORS, AVATAR_EMOJI, BANNER_COLORS, BANNER_WASH } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/ui/role-badge';
import PageSkeleton from '@/components/PageSkeleton';
import { Security2FA } from '@/app/(app)/settings/Security2FA';
import { USERNAME_RE, RESERVED_USERNAMES } from '@/lib/username';
import { PRONOUN_MAX, PRONOUN_SUGGESTIONS, pronounsProblem } from '@/lib/pronouns';

/**
 * Settings — one page, five questions:
 *
 *   • Who you are on the outside (Profile)
 *   • Who may see it (Privacy)
 *   • Where we reach you (Account — email)
 *   • What guards the door (Security — password, 2FA)
 *   • How the app behaves (Preferences)
 *
 * Every action confirms itself in its own section, so a save in Profile never
 * answers for a save in Privacy. Copy stays short: the label is the sentence.
 */

const VISIBILITY_ROWS: { key: 'name' | 'nickname' | 'bio' | 'pronouns' | 'subjects' | 'stats' | 'achievements'; label: string; hint: string }[] = [
  { key: 'name', label: 'Full name', hint: 'Your real name, as registered.' },
  { key: 'nickname', label: 'Display name', hint: 'The name your profile leads with.' },
  { key: 'bio', label: 'About me', hint: 'Your short introduction.' },
  { key: 'pronouns', label: 'Pronouns', hint: 'The words you want to be referred to by.' },
  { key: 'subjects', label: 'Subjects', hint: 'What you are studying.' },
  { key: 'stats', label: 'XP and rank', hint: 'Your level, XP, streak and review count.' },
  { key: 'achievements', label: 'Achievements', hint: 'The badges you have earned.' },
];

export default function SettingsPage() {
  const { me, loading, refresh } = useMe();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  return (
    <div className="space-y-6">
      <PageHeader icon="person" title="Settings" subtitle="Your profile, account and how the app behaves." />
      {loading || !me ? <PageSkeleton /> : <SettingsBody me={me} refresh={refresh} mutate={mutate} router={router} />}
    </div>
  );
}

function SettingsBody({
  me,
  refresh,
  mutate,
  router,
}: {
  me: NonNullable<ReturnType<typeof useMe>['me']>;
  refresh: () => void;
  mutate: ReturnType<typeof useSWRConfig>['mutate'];
  router: ReturnType<typeof useRouter>;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // ── Profile ─────────────────────────────────────────────────────────────
  const [name, setName] = useState(me.name);
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [username, setUsername] = useState(me.username ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [pronouns, setPronouns] = useState(me.pronouns ?? '');
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(me.avatarEmoji);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl);
  const [bannerUrl, setBannerUrl] = useState(me.bannerUrl);
  const [bannerColor, setBannerColor] = useState(me.bannerColor ?? 'dusk');
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const uploadImage = async (kind: 'avatar' | 'banner', file: File) => {
    setUploading(kind);
    setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
        throw new Error('Images must be PNG, JPEG or GIF.');
      }
      if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
      const { url, key } = await api.post<{ url: string; key: string }>('/api/v1/media', {
        action: 'presign',
        kind,
        contentType: file.type,
        sizeBytes: file.size,
      });
      const res = await fetch(url, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
      if (!res.ok) throw new Error('The image upload was rejected. Try a smaller file.');
      const { url: publicUrl } = await api.post<{ url: string }>('/api/v1/media', {
        action: 'confirm',
        kind,
        key,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (kind === 'avatar') setAvatarUrl(publicUrl);
      else setBannerUrl(publicUrl);
      setNote(kind === 'avatar' ? 'Avatar updated.' : 'Banner updated.');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload did not go through.');
    } finally {
      setUploading(null);
    }
  };

  const removeImage = async (kind: 'avatar' | 'banner') => {
    setUploading(kind);
    setError('');
    try {
      await api.post('/api/v1/media', { action: 'remove', kind });
      if (kind === 'avatar') setAvatarUrl(null);
      else setBannerUrl(null);
      setNote(kind === 'avatar' ? 'Avatar removed.' : 'Banner removed.');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not remove that.');
    } finally {
      setUploading(null);
    }
  };

  // ── Privacy ─────────────────────────────────────────────────────────────
  const [vis, setVis] = useState(me.profileVisibility);

  // ── Email ───────────────────────────────────────────────────────────────
  const [emailPassword, setEmailPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // ── Password ────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const say = (good: string, bad?: string) => {
    if (bad) {
      setError(bad);
      setNote('');
    } else {
      setError('');
      setNote(good);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    setError('');
    try {
      await api.patch('/api/v1/me', {
        name: name.trim(),
        nickname: nickname.trim() || null,
        username: username.trim() ? username.trim().toLowerCase() : null,
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        avatarEmoji,
        avatarColor,
        bannerColor,
      });
      setNote('Profile saved.');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save that.');
    } finally {
      setSavingProfile(false);
    }
  };

  const saveVisibility = async (key: keyof typeof vis, value: boolean) => {
    const next = { ...vis, [key]: value };
    setVis(next);
    try {
      await api.patch('/api/v1/me', { profileVisibility: { [key]: value } });
      setNote('Privacy updated.');
    } catch (e) {
      setVis(vis); // put the toggle back — the save did not land
      setError(e instanceof Error ? e.message : 'We could not change that.');
    }
  };

  const requestEmailChange = async () => {
    setError('');
    try {
      await api.post('/api/v1/me/email', { password: emailPassword, newEmail });
      setNote(`Check ${newEmail} — the link to confirm arrives by email.`);
      setEmailPassword('');
      setNewEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start that change.');
    }
  };

  const changePassword = async () => {
    setError('');
    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }
    try {
      await api.post('/api/v1/me/password', { currentPassword, newPassword });
      setNote('Password changed. Other devices have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Every refresh token is dead, including ours. Get a fresh session
      // quietly rather than let the next API call discover the logout.
      await api.post('/api/v1/auth/refresh').catch(() => undefined);
      void mutate('/api/v1/me');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not change the password.');
    }
  };

  const savePrefs = async (patch: Record<string, unknown>) => {
    try {
      await api.patch('/api/v1/me', { prefs: patch });
      setNote('Saved.');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save that.');
    }
  };

  const profileDirty =
    name !== me.name ||
    nickname !== (me.nickname ?? '') ||
    username !== (me.username ?? '') ||
    bio !== (me.bio ?? '') ||
    pronouns !== (me.pronouns ?? '') ||
    avatarEmoji !== me.avatarEmoji ||
    avatarColor !== me.avatarColor ||
    bannerColor !== (me.bannerColor ?? 'dusk');
  // avatarUrl/bannerUrl are not part of the dirty check: uploads confirm and
  // save themselves, so "Unsaved changes" never lies about them.

  const usernameOk =
    !username.trim() || (USERNAME_RE.test(username.trim().toLowerCase()) && !RESERVED_USERNAMES.has(username.trim().toLowerCase()));
  const usernameChanged = username.trim().toLowerCase() !== (me.username ?? '');
  const pronounProblem = pronounsProblem(pronouns);

  return (
    <div className="space-y-6">
      <Notice tone="good" show={!!note}>{note}</Notice>
      <Notice tone="bad" show={!!error}>{error}</Notice>

      {/* ── Profile ───────────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="t-strong">Profile</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          How you appear on your public profile{' '}
          {me.username ? (
            <Link href={`/u/${me.username}`} className="font-semibold text-foreground underline underline-offset-4">
              /u/{me.username}
            </Link>
          ) : (
            <span>— pick a username to get an address</span>
          )}
          .
        </p>

        <div className="mt-3 flex items-center gap-2">
          <RoleBadge role={me.role} />
          <span className="t-fine text-muted-foreground">Your account type — shown on your public profile.</span>
        </div>

        <div className="mt-5">
          <span className="label">Banner</span>
          <div className="mt-1.5">
            <ProfileBanner imageUrl={bannerUrl} color={bannerColor} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Banner colour">
            {BANNER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Banner: ${c}`}
                aria-pressed={bannerColor === c}
                disabled={!!bannerUrl}
                title={bannerUrl ? 'Remove the banner image to use a colour wash' : `Banner: ${c}`}
                onClick={() => setBannerColor(c)}
                className={cn(bannerColor === c)}
              >
                <span
                  className={cn(
                    'inline-block h-7 w-11 rounded-md border border-border/60',
                    BANNER_WASH[c as keyof typeof BANNER_WASH] ?? BANNER_WASH.dusk,
                    bannerColor === c && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
                  )}
                />
              </button>
            ))}
            <span className="t-fine ml-1 text-muted-foreground">{bannerUrl ? 'An uploaded image is covering the wash' : 'The wash shows when no image is uploaded'}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="btn btn-secondary btn-sm gap-1.5 cursor-pointer">
              <Icon name="download" size={14} />
              {uploading === 'banner' ? 'Uploading…' : bannerUrl ? 'Replace banner' : 'Upload banner'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="sr-only"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage('banner', f);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            {bannerUrl && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={uploading !== null} onClick={() => void removeImage('banner')}>
                Remove
              </button>
            )}
            <span className="t-fine text-muted-foreground">PNG, JPEG or GIF · up to 5 MB · wide images crop to fit</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Avatar name={nickname || name} emoji={avatarEmoji} color={avatarColor} imageUrl={avatarUrl} size={64} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Avatar colour">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour: ${c}`}
                aria-pressed={avatarColor === c}
                onClick={() => setAvatarColor(c)}
                className={cn(avatarColor === c)}
              >
                <Avatar name="Aa" color={c} size={28} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Avatar symbol">
            <button
              type="button"
              aria-pressed={!avatarEmoji}
              onClick={() => setAvatarEmoji(null)}
              className={cnChip(!avatarEmoji)}
            >
              Initials
            </button>
            {AVATAR_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={avatarEmoji === e}
                onClick={() => setAvatarEmoji(e)}
                className={cnChip(avatarEmoji === e)}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="btn btn-secondary btn-sm cursor-pointer gap-1.5">
              <Icon name="download" size={14} />
              {uploading === 'avatar' ? 'Uploading…' : avatarUrl ? 'Replace image' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="sr-only"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage('avatar', f);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            {avatarUrl && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={uploading !== null} onClick={() => void removeImage('avatar')}>
                Remove image
              </button>
            )}
            <span className="t-fine text-muted-foreground">An uploaded picture replaces the emoji.</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="set-name">
            <input id="set-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Display name" htmlFor="set-nickname" hint="Shown on your profile instead of your full name.">
            <input id="set-nickname" className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} placeholder="Optional" />
          </Field>
          <Field
            label="Username"
            htmlFor="set-username"
            hint={usernameOk ? (username ? `Your profile: /u/${username.toLowerCase()}` : 'Optional — letters, numbers, hyphens.') : '3–20 characters: letters, numbers, hyphens, underscores.'}
            bad={!usernameOk}
          >
            <input
              id="set-username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={20}
              placeholder="Optional"
              aria-invalid={!usernameOk}
            />
          </Field>
          <Field label="About me" htmlFor="set-bio" hint="A line or two, up to 240 characters.">
            <textarea id="set-bio" className="input min-h-[72px]" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={240} placeholder="Optional" />
          </Field>
          {/* Pronouns get their own full-width row rather than a third cell: the
              chips are the point, and a two-column grid would squeeze six of them
              into half the card. */}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="set-pronouns">Pronouns</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Pronoun suggestions">
              {PRONOUN_SUGGESTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`chip ${pronouns.trim().toLowerCase() === p ? 'chip-active' : ''}`}
                  aria-pressed={pronouns.trim().toLowerCase() === p}
                  onClick={() => setPronouns(pronouns.trim().toLowerCase() === p ? '' : p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              id="set-pronouns"
              className="input mt-2"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              maxLength={PRONOUN_MAX}
              placeholder="Optional — anything you want to be called by"
              aria-invalid={!!pronounProblem}
              aria-describedby="set-pronouns-hint"
            />
            <p id="set-pronouns-hint" className={pronounProblem ? 't-fine mt-1 text-destructive' : 't-fine mt-1 text-muted-foreground'}>
              {pronounProblem ??
                (vis.pronouns
                  ? 'Shown on your public profile beside your name.'
                  : 'Private for now — visitors will not see it. Switch Pronouns on under Privacy below.')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!profileDirty || !usernameOk || !!pronounProblem || savingProfile}
            onClick={saveProfile}
          >
            <Icon name="checked" size={15} />
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
          {profileDirty && <span className="t-caption text-muted-foreground">Unsaved changes</span>}
        </div>
      </section>

      {/* ── Privacy ───────────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="t-strong">Privacy</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Choose what someone visiting your profile can see. You always see everything.
        </p>
        <div className="mt-4 divide-y divide-border">
          {VISIBILITY_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <label htmlFor={`vis-${row.key}`} className="text-[14px] font-semibold">{row.label}</label>
                <p className="t-caption text-muted-foreground">{row.hint}</p>
              </div>
              <Toggle
                id={`vis-${row.key}`}
                on={vis[row.key]}
                onChange={(v) => saveVisibility(row.key, v)}
                label={`${row.label} visible to visitors`}
              />
            </div>
          ))}
        </div>
        <p className="t-fine mt-3 text-muted-foreground">
          Your email is never shown to anyone. Leaderboard visibility is a separate switch on the Rank page.
        </p>
      </section>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="t-strong">Account</h2>
        <p className="t-caption mt-1 text-muted-foreground">
          Signed in as <span className="font-mono text-[13px]">{me.email}</span>
          {me.status !== 'active' ? ' — email not verified yet.' : '.'}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="New email" htmlFor="set-email" hint="We email a confirmation link; the change happens when you click it.">
            <input id="set-email" type="email" className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@school.example" autoComplete="email" />
          </Field>
          <Field label="Current password" htmlFor="set-email-pw" hint="Proof it is you.">
            <input id="set-email-pw" type="password" className="input" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        </div>
        <button
          type="button"
          className="btn btn-secondary mt-4"
          disabled={!newEmail.trim() || !emailPassword}
          onClick={requestEmailChange}
        >
          <Icon name="mail" size={15} />
          Send confirmation email
        </button>
      </section>      {/* ── Security ──────────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="t-strong">Security</h2>
        <p className="t-caption mt-1 text-muted-foreground">Password and two-factor sign-in.</p>

        <div className="mt-4 border-t border-border pt-4">
          {/* The chip is an in-page anchor now: it announces state and leads to
              the control that changes it, instead of linking to the page it is
              already on. */}
          <div className="flex items-center justify-between gap-3">
            <a
              href="#two-factor"
              className="chip shrink-0"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('two-factor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                document.getElementById('two-factor')?.focus?.();
              }}
            >
              <Icon name="secure" size={14} />
              {me.totpEnabled ? '2FA on' : '2FA off'}
            </a>
          </div>
          <div className="mt-3">
            <Security2FA enabled={me.totpEnabled} onChanged={refresh} />
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <h3 className="t-caption-s">Password</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Current password" htmlFor="set-pw-current">
              <input id="set-pw-current" type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="New password" htmlFor="set-pw-new" hint="At least 8 characters.">
              <input id="set-pw-new" type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Repeat new password" htmlFor="set-pw-confirm">
              <input id="set-pw-confirm" type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-4"
            disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}
            onClick={changePassword}
          >
            <Icon name="secure" size={15} />
            Change password
          </button>
          <p className="t-fine mt-2 text-muted-foreground">Changing your password signs out every other device.</p>
        </div>
      </section>

      {/* ── Preferences ───────────────────────────────────────────────────── */}
      <section className="card p-5">
        <h2 className="t-strong">Preferences</h2>
        <div className="mt-4 divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <label htmlFor="pref-density" className="text-[14px] font-semibold">Note density</label>
              <p className="t-caption text-muted-foreground">Full notes while learning, or the short version.</p>
            </div>
            <select
              id="pref-density"
              className="input max-w-[150px]"
              value={me.prefs?.noteDensity ?? 'detailed'}
              onChange={(e) => savePrefs({ noteDensity: e.target.value })}
            >
              <option value="detailed">Detailed</option>
              <option value="summary">Summary</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <label htmlFor="pref-motion" className="text-[14px] font-semibold">Reduce motion</label>
              <p className="t-caption text-muted-foreground">Calmer animations throughout the app.</p>
            </div>
            <Toggle
              id="pref-motion"
              on={me.prefs?.reducedMotion ?? false}
              onChange={(v) => savePrefs({ reducedMotion: v })}
              label="Reduce motion"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <label htmlFor="pref-board" className="text-[14px] font-semibold">Show me on leaderboards</label>
              <p className="t-caption text-muted-foreground">Your rank is unaffected either way.</p>
            </div>
            <Toggle
              id="pref-board"
              on={!me.leaderboardOptOut}
              onChange={(v) => api.patch('/api/v1/me', { leaderboardOptOut: !v }).then(refresh).catch(() => undefined)}
              label="Leaderboard visibility"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, htmlFor, hint, bad, children }: { label: string; htmlFor: string; hint?: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {hint && <p id={`${htmlFor}-hint`} className={bad ? 't-fine mt-1 text-destructive' : 't-fine mt-1 text-muted-foreground'}>{hint}</p>}
    </div>
  );
}

function Toggle({ id, on, onChange, label }: { id: string; on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-150 ${on ? 'bg-good' : 'bg-border-strong'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all duration-150 ${on ? 'left-[22px]' : 'left-0.5'}`}
        aria-hidden
      />
    </button>
  );
}

function cnChip(active: boolean): string {
  return `grid h-9 min-w-9 place-items-center rounded-full border px-2 text-[16px] transition-colors duration-150 ${
    active ? 'border-foreground bg-secondary' : 'border-border hover:border-border-strong'
  }`;
}

function cnColor(active: boolean): string {
  return `rounded-full border-2 p-0.5 transition-colors duration-150 ${active ? 'border-foreground' : 'border-transparent'}`;
}
