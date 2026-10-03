import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** Server-side gate for every admin page: a signed-in user who is in public.admins. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login?error=not-admin");

  return { user, supabase };
}
