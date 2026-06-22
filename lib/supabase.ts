import { createClient } from "@supabase/supabase-js";

// 前端用 anon key（受 RLS 保護）
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
