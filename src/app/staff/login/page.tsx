import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false, follow: false } };

export default function StaffLoginPage() {
  return (
    <AuthShell footer="Staff portals are not linked from the app.">
      <AuthForm mode="login" staff />
    </AuthShell>
  );
}
