import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { classes, subjects, users } from '@/db/schema';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icons';
import { buttonVariants } from '@/lib/button-variants';
import { cn } from '@/lib/utils';

/**
 * Classroom invite link — /join/<code>.
 *
 * A teacher shares this address (or just the code) and it lands the student on
 * a page that names the class before asking for anything. The code rides
 * through to /register?class=…, where the existing registration flow joins the
 * class on signup; learners who already have an account join from the app.
 *
 * Public on purpose: the whole point is that it opens for someone with no
 * account and nothing installed. Only the class name, subject and teacher's
 * first name are shown — enough to recognise the invite, nothing more.
 */

const CODE_RE = /^[A-Z0-9]{6}$/;

export const metadata: Metadata = {
  title: 'Join a class · Revisio',
  description: 'Accept a class invite on Revisio.',
};

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const valid = CODE_RE.test(code);

  const invite = valid
    ? await (async () => {
        const [row] = await db
          .select({
            className: classes.name,
            subjectName: subjects.name,
            teacherName: users.name,
          })
          .from(classes)
          .innerJoin(subjects, eq(classes.subjectId, subjects.id))
          .innerJoin(users, eq(classes.teacherId, users.id))
          .where(eq(classes.joinCode, code))
          .limit(1);
        return row ?? null;
      })()
    : null;

  return (
    <div className="mx-auto flex min-h-viewport w-full max-w-[520px] flex-col justify-center px-4 py-10">
      <Card className="p-6 text-center sm:p-8">
        {invite ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Icon name="join" size={22} />
            </span>
            <h1 className="t-display-sm mt-4">Join {invite.className}</h1>
            <p className="t-body mt-2 text-muted-foreground">
              {invite.subjectName}
              {invite.teacherName ? ` · with ${invite.teacherName.split(' ')[0]}` : ''}
            </p>
            <p className="t-caption mt-4 text-muted-foreground">
              Create a free account and you will be in the class straight away.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href={`/register?class=${code}`} className={buttonVariants({ variant: 'primary' })}>
                Create account &amp; join
                <Icon name="next" size={16} />
              </Link>
              <Link href="/login" className={buttonVariants({ variant: 'secondary' })}>
                I have an account
              </Link>
            </div>
          </>
        ) : (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Icon name="join" size={22} />
            </span>
            <h1 className="t-display-sm mt-4">
              {valid ? 'That code did not match a class' : 'That does not look like a class code'}
            </h1>
            <p className="t-body mt-2 text-muted-foreground">
              Check the link your teacher sent, or ask them for a fresh one.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/register" className={buttonVariants({ variant: 'primary' })}>
                Start free anyway
              </Link>
              <Link href="/" className={cn(buttonVariants({ variant: 'ghost' }), 'text-muted-foreground')}>
                Back to Revisio
              </Link>
            </div>
          </>
        )}
      </Card>
      <p className="t-fine mt-4 text-center text-muted-foreground">
        Class codes are six letters and numbers. They are shared by your teacher — never posted publicly.
      </p>
    </div>
  );
}
