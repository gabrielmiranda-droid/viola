import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-line bg-panel p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-accent">NELORE&apos;S BURGUER</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal">Login</h1>
          <p className="mt-2 text-sm text-muted">
            Entre com o usuario liberado para vender ou gerenciar.
          </p>
        </div>

        <LoginForm next={params?.next} />
      </section>
    </main>
  );
}
