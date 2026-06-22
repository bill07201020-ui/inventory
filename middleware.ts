import { NextRequest, NextResponse } from "next/server";

// 病患查詢限流：對 /api/track 同 IP 每分鐘限 5 次。
// 小量用 Supabase rate_limit 表（透過 bump_rate_limit RPC 原子遞增）；量大可改 Upstash Redis。
// middleware 在 Edge Runtime 執行，故直接用 fetch 呼叫 RPC，不載入完整 supabase-js client。
const LIMIT = 5;
const WINDOW_MS = 60_000;

export const config = {
  matcher: ["/api/track"],
};

export async function middleware(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const windowStart = new Date(
    Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS
  ).toISOString();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 設定不全時 fail-open，避免擋掉正常查詢
  if (!url || !serviceKey) return NextResponse.next();

  try {
    const res = await fetch(`${url}/rest/v1/rpc/bump_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_ip: ip, p_window: windowStart }),
    });

    if (res.ok) {
      const count = (await res.json()) as number;
      if (typeof count === "number" && count > LIMIT) {
        return NextResponse.json(
          { error: "查詢過於頻繁，請稍後再試" },
          { status: 429 }
        );
      }
    }
  } catch {
    // 限流服務故障 → fail-open
  }

  return NextResponse.next();
}
