import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/**
 * Server-side gate for every admin page: a signed-in user who is in public.admins.
 * One round trip: is_admin() is false without a valid session, and the database
 * rejects an invalid or expired token.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) redirect(error ? "/admin/login" : "/admin/login?error=not-admin");
}
