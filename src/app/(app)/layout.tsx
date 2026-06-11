import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <ToastProvider>
      <AppShell profile={profile}>{children}</AppShell>
    </ToastProvider>
  );
}
