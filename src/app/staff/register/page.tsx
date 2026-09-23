import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Staff registration', robots: { index: false, follow: false } };

export default function StaffRegisterPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <AuthForm mode="register" staff />
    </main>
  );
}
