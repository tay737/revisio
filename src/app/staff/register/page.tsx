import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';
import { AuthShell } from '@/components/AuthShell';

export const metadata: Metadata = {
  title: 'Staff registration',
  robots: { index: false, follow: false },
};

export default function StaffRegisterPage() {
  return (
    <AuthShell footer="Developer accounts are approved by an existing developer.">
      <AuthForm mode="register" staff />
    </AuthShell>
  );
}
