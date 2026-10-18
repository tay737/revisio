import Link from 'next/link';
import RegisterWizard from '@/components/RegisterWizard';
import { AuthShell } from '@/components/AuthShell';

export default function RegisterPage() {
  return (
    <AuthShell
      footer={
        <Link href="/" className="transition-colors hover:text-foreground">
          Back to Revisio
        </Link>
      }
    >
      <RegisterWizard />
    </AuthShell>
  );
}
