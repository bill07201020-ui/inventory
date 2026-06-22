import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 病患查詢：姓名 + 電話末四碼 → patient_track 函式。
// 只回傳安全欄位；送達照另外換成 signed URL。
// 限流由 middleware.ts 負責（同 IP 每分鐘 5 次）。
export async function POST(req: NextRequest) {
  let name: string;
  let last4: string;
  try {
    const body = await req.json();
    name = String(body.name ?? "").trim();
    last4 = String(body.last4 ?? "").trim();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  if (!name || !/^\d{4}$/.test(last4)) {
    return NextResponse.json({ error: "請輸入姓名與電話末四碼" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("patient_track", {
    p_name: name,
    p_phone_last4: last4,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    case_id: string;
    patient_name: string;
    item_type: string | null;
    stage: string;
    received_at: string | null;
    delivered_at: string | null;
    delivered_photo: string | null;
  }>;

  // 把送達照 path 換成 signed URL
  const results = await Promise.all(
    rows.map(async (r) => {
      let deliveredPhotoUrl: string | null = null;
      if (r.delivered_photo) {
        const { data: signed } = await supabaseAdmin.storage
          .from("case-photos")
          .createSignedUrl(r.delivered_photo, 600);
        deliveredPhotoUrl = signed?.signedUrl ?? null;
      }
      return {
        caseId: r.case_id,
        patientName: r.patient_name,
        itemType: r.item_type,
        stage: r.stage,
        receivedAt: r.received_at,
        deliveredAt: r.delivered_at,
        deliveredPhotoUrl,
      };
    })
  );

  return NextResponse.json({ results });
}
