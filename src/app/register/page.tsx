import AuthForm from '@/components/AuthForm';
import { Aurora } from '@/components/ui/aurora';
import { BlurIn } from '@/components/ui/blur-in';

export default function RegisterPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-10">
      <Aurora />
      <BlurIn className="relative">
        <AuthForm mode="register" />
      </BlurIn>
    </main>
  );
}
