import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 用 service_role 將 storage path 換成 10 分鐘有效的 signed URL。
// 病患送達照不開放 anon 直讀，一律走這支。
export async function POST(req: NextRequest) {
  try {
    const { path } = await req.json();
    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "缺少 path" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("case-photos")
      .createSignedUrl(path, 600); // 10 分鐘

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "簽章失敗" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }
}
