import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10">
      <AuthForm mode="login" />
    </main>
  );
}
