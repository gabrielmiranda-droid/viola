"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres."),
  next: z.string().optional(),
});

export type LoginState = {
  message?: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  status: "active" | "inactive";
};

function safeNext(next: string | undefined, role: UserRole) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/caixa";
  }

  if (role !== "admin" && next !== "/caixa") {
    return "/caixa";
  }

  return next;
}

export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!hasSupabaseEnv()) {
    return {
      message:
        "Configure o .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Dados invalidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { message: "E-mail ou senha invalidos." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id,name,email,role,status")
    .eq("id", data.user.id)
    .single<ProfileRow>();

  if (profileError || !profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { message: "Usuario sem perfil ativo no sistema." };
  }

  await supabase.from("audit_logs").insert({
    user_id: profile.id,
    action: "login",
    entity: "auth",
    entity_id: profile.id,
    metadata: {
      email: profile.email,
      role: profile.role,
    },
  });

  redirect(safeNext(parsed.data.next, profile.role));
}
