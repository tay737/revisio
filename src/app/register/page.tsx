import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';

export default function RegisterPage() {
  return (
    <AuthShell
      footer={
        <Link href="/" className="transition-colors hover:text-ink">
          Back to Revisio
        </Link>
      }
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
