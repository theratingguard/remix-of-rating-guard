import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const profileQuery = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Not signed in");
      let { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!p) {
        const ins = await supabase.from("profiles").insert({ user_id: user.id, username: user.email ?? null }).select("*").single();
        p = ins.data;
      }
      let avatarUrl: string | null = null;
      if (p?.avatar_path) {
        const s = await supabase.storage.from("avatars").createSignedUrl(p.avatar_path, 3600);
        avatarUrl = s.data?.signedUrl ?? null;
      }
      return {
        name: p?.name ?? "Admin",
        username: p?.username ?? user.email ?? "",
        email: user.email ?? "",
        pendingEmail: user.new_email ?? null,
        status: p?.status ?? "active",
        lastLogin: user.last_sign_in_at ?? null,
        avatarUrl,
      };
    },
  });
