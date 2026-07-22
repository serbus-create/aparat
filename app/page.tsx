import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AparatApp from "@/components/AparatApp";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Invited user's first login lands here before the handle_new_user
    // trigger's row is visible to this session — send them to finish setup.
    redirect("/set-password");
  }

  return <AparatApp profile={profile} />;
}
