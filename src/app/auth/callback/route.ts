import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Exchanges Supabase's one-time PKCE code for a session.
 * Redirect targets are fixed local routes to prevent an open redirect.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const redirectToPassword = request.nextUrl.searchParams.get("next") === "/auth/update-password";
  if (code) {
    const supabase = await getServerSupabase();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(
          new URL(redirectToPassword ? "/auth/update-password" : "/", request.url)
        );
      }
    }
  }
  return NextResponse.redirect(new URL("/?auth_error=1", request.url));
}
