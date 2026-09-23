import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';
import { BlurIn } from '@/components/ui/blur-in';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false, follow: false } };

export default function StaffLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <div className="absolute right-6 top-6"><ThemeToggle /></div>
      <BlurIn>
        <AuthForm mode="login" staff />
      </BlurIn>
    </main>
  );
}
