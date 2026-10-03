import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Browser client. Uses the publishable key only; RLS decides what it can do.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
