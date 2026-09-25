import Link from 'next/link';
import AuthForm from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';

export default function LoginPage() {
  return (
    <AuthShell
      footer={
        <Link href="/staff/login" className="transition-colors hover:text-foreground">
          Staff sign in
        </Link>
      }
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
