import { createClient } from "@supabase/supabase-js";

// 後端用 service_role key（給 signed URL / 限流）。
// 僅在 server 端 import；切勿在 client component 使用，避免進前端 bundle。
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
