import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

// First line of defence for /admin: refresh the session cookie and send anyone
// who isn't a signed-in admin to the login page. The admin layout checks again on
// the server, and the database enforces every write regardless.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLogin = request.nextUrl.pathname === "/admin/login";

  const redirectTo = (path: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed or cleared auth cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!user) return isLogin ? response : redirectTo("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return isLogin ? response : redirectTo("/admin/login", "?error=not-admin");
  }

  return isLogin ? redirectTo("/admin") : response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
