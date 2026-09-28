import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { Icon, achievementIcon } from '@/components/ui/icons';
import { RankCrest } from '@/components/ui/rank-crest';
import { Avatar, ProfileBanner } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/ui/role-badge';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BlurFade } from '@/components/ui/blur-fade';
import { verifyAccessToken } from '@/services/auth';
import { getPublicProfile } from '@/services/profile';
import { rankFor } from '@/domain/ranked';
import { cappedDelay } from '@/lib/motion';
import { ProfileBadgeChip } from '@/components/ui/profile-badge';

/**
 * The public profile — /u/<username>.
 *
 * Outside the app shell on purpose: a shared profile link must open for a
 * signed-out visitor with nothing more than a Google-able address. Everything
 * private was already filtered server-side (services/profile.ts), so this
 * page only ever renders what the owner chose to show and hides the rest
 * without comment — a hidden field is blank, never a lock icon asking
 * questions the visitor did not ask.
 *
 * The owner gets one quiet affordance: their own profile links to Settings,
 * because the moment you see your profile is the moment you want to edit it.
 */
export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const profile = await getPublicProfile(params.handle, null);
  if (!profile) return { title: 'Profile — Revisio' };
  const display = profile.nickname || profile.name || profile.username || 'Learner';
  return {
    title: `${display} — Revisio`,
    description: profile.bio ?? `${display} is studying on Revisio.`,
  };
}

export default async function ProfilePage({ params }: { params: { handle: string } }) {
  // The page is public; a signed-in visitor carries their access token in the
  // Authorization header, and it is only used to answer "is this yours?".
  const auth = (await headers()).get('authorization');
  const viewer = auth?.startsWith('Bearer ') ? await verifyAccessToken(auth.slice(7)) : null;
  const profile = await getPublicProfile(params.handle, viewer);
  if (!profile) notFound();

  const owner = viewer?.id === profile.id;
  const display = profile.nickname || profile.name || 'This learner';
  const rank = profile.gamification
    ? rankFor(profile.gamification.totalXp)
    : null;
  const joined = new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10">
      {/* ── Banner ─────────────────────────────────────────────────────── */}
      <ProfileBanner imageUrl={profile.bannerUrl} color={profile.bannerColor} className="-mx-4 -mt-10 sm:-mx-6" />

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      {/*
        The avatar pulls up over the banner's lower edge; the header carries a
        padding floor beneath it so the avatar's hang (88px − 48px pull-up =
        40px below the banner) never collides with the bio or meta lines on
        any width — the old layout let the flex row ride up into both.
      */}
      <header className="-mt-12 flex flex-wrap items-end gap-x-4 gap-y-3 px-1 pb-5">
        <div className="shrink-0 rounded-full ring-4 ring-background">
          <Avatar name={display} emoji={profile.avatarEmoji} color={profile.avatarColor} imageUrl={profile.avatarUrl} size={88} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="t-display truncate">{display}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <RoleBadge role={profile.role} />
            {profile.badges.map((b) => (
              <ProfileBadgeChip key={b.id} label={b.label} icon={b.icon} color={b.color} />
            ))}
            {profile.username ? <span className="t-caption text-muted-foreground">@{profile.username}</span> : null}
            {profile.visibility.name && profile.name && profile.name !== display ? (
              <span className="t-caption text-muted-foreground">· {profile.name}</span>
            ) : null}
          </div>
          {profile.bio && <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed">{profile.bio}</p>}
        </div>
        {owner && (
          <Link href="/settings" className="btn btn-secondary btn-sm shrink-0 gap-1.5">
            <Icon name="edit" size={14} />
            Edit profile
          </Link>
        )}
      </header>

      {/* ── Rank + stats ─────────────────────────────────────────────────── */}
      {rank && profile.gamification ? (
        <section className="card mt-6 flex flex-wrap items-center gap-5 p-5">
          <RankCrest rank={rank} size={72} />
          <div className="min-w-0">
            <div className="t-strong">{profile.gamification.rankLabel}</div>
            <div className="num mt-0.5 text-[13px] text-muted-foreground">
              <NumberTicker value={profile.gamification.totalXp} /> XP · Level {profile.gamification.level}
            </div>
          </div>
          <dl className="ml-auto grid grid-cols-3 gap-4 text-center sm:gap-6">
            <div>
              <dt className="t-fine text-muted-foreground">Streak</dt>
              <dd className="num t-strong">{profile.gamification.streak}d</dd>
            </div>
            <div>
              <dt className="t-fine text-muted-foreground">Reviews</dt>
              <dd className="num t-strong">{profile.reviewCount}</dd>
            </div>
            <div>
              <dt className="t-fine text-muted-foreground">Achievements</dt>
              <dd className="num t-strong">{profile.achievements.length}</dd>
            </div>
          </dl>
        </section>
      ) : owner ? (
        <section className="card mt-6 p-5 text-center">
          <p className="text-[14px] text-muted-foreground">
            Your stats are hidden from visitors. Turn them on in Settings → Privacy if you want them shown.
          </p>
        </section>
      ) : null}

      {/* ── Subjects ─────────────────────────────────────────────────────── */}
      {profile.subjects.length > 0 && (
        <section className="mt-6">
          <h2 className="t-tagline">Studying</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.subjects.map((s) => (
              <span key={s.id} className="chip">
                <Icon name="learn" size={13} />
                {s.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Achievements ─────────────────────────────────────────────────── */}
      {profile.achievements.length > 0 && (
        <section className="card mt-6 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="t-tagline">Achievements</h2>
            <span className="num text-[13px] text-muted-foreground">{profile.achievements.length}</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {profile.achievements.map((a, i) => (
              <BlurFade key={a.id} delay={cappedDelay(i, 0.03, 0.24)}>
                <div className="flex items-center gap-3 rounded-md border border-border px-3.5 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/25 text-foreground">
                    <Icon name={achievementIcon(a.id, a.icon)} size={17} />
                  </span>
                  <div className="min-w-0">
                    <div className="t-caption-s">{a.name}</div>
                    <div className="text-[12px] text-muted-foreground">{a.description}</div>
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="t-fine text-muted-foreground">On Revisio since {joined}</p>
        {!owner && (
          <Link href="/" className="t-fine font-semibold text-foreground underline underline-offset-4">
            What is Revisio?
          </Link>
        )}
      </footer>
    </div>
  );
}

export const dynamic = 'force-dynamic';
