import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles Supabase invite / recovery / magic-link redirects (PKCE `code` flow).
// After exchanging the code for a session we always send the user to
// /set-password so invited users can pick their initial password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/set-password`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
