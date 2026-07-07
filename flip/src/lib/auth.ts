import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/client";

export interface FlipUser {
  id: string;
  email: string | null;
  name: string;
}

/**
 * Returns the current user, or a preview user when Supabase is not configured
 * (so the UI is fully explorable before backend setup).
 */
export async function getCurrentUser(): Promise<FlipUser> {
  if (!hasSupabaseEnv) {
    return { id: "preview", email: null, name: "Marco" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { id: "preview", email: null, name: "Marco" };

  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user.email?.split("@")[0] ?? "");
  return { id: user.id, email: user.email ?? null, name: name || "amico" };
}
