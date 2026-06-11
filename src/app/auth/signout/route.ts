import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "logout",
      entity: "auth",
      entity_id: user.id,
      metadata: {},
    });
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 302,
  });
}
