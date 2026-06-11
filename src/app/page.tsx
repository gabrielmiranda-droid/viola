import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect("/caixa");
}
