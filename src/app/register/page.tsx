import Link from 'next/link';
import RegisterWizard from '@/components/RegisterWizard';
import { AuthShell } from '@/components/AuthShell';

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { class?: string };
}) {
  // /register?class=B7K2QM arrives from a classroom invite link (/join/<code>);
  // the wizard seeds the optional class-code field so the learner only has to
  // confirm it on the review step.
  const classCode = (searchParams.class ?? '').trim().toUpperCase();
  return (
    <AuthShell
      footer={
        <Link href="/" className="transition-colors hover:text-foreground">
          Back to Revisio
        </Link>
      }
    >
      <RegisterWizard initialClassCode={classCode} />
    </AuthShell>
  );
}
