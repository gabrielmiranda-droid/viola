import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  status: "active" | "inactive";
};

function normalizeProfile(profile: ProfileRow): Profile {
  return {
    id: profile.id,
    name: profile.name || profile.email || "Usuario",
    email: profile.email || "",
    role: profile.role,
    status: profile.status,
  };
}

export async function getCurrentProfile() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,role,status")
      .eq("id", user.id)
      .single<ProfileRow>();

    if (error || !data || data.status !== "active") {
      return null;
    }

    return normalizeProfile(data);
  } catch {
    return null;
  }
}

export async function requireProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

export async function requireRole(roles: UserRole[]) {
  const profile = await requireProfile();

  if (!roles.includes(profile.role)) {
    redirect("/caixa");
  }

  return profile;
}

export async function requireAdmin() {
  return requireRole(["admin"]);
}
