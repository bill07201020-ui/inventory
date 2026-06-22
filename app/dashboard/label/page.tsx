"use client";

import { useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, Printer, QrCode as QrIcon } from "lucide-react";

export default function LabelPage() {
  const [caseId, setCaseId] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [trackUrl, setTrackUrl] = useState("");

  async function generate() {
    const base =
      process.env.NEXT_PUBLIC_TRACK_BASE_URL ?? "https://track.example.com/track";
    const url = `${base}/${caseId.trim()}`;
    const png = await QRCode.toDataURL(url, { width: 220, margin: 1 });
    setTrackUrl(url);
    setDataUrl(png);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> 返回案件管理
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-slate-800">QR 標籤產生</h1>
      <p className="mt-2 text-sm text-slate-500">
        輸入案件編號，產生病患查詢用的 QR code，供標籤機列印。
      </p>

      <div className="mt-6 flex gap-3">
        <input
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          placeholder="case_id (UUID)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
        />
        <button
          onClick={generate}
          disabled={!caseId.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          <QrIcon className="h-4 w-4" /> 產生
        </button>
      </div>

      {dataUrl && (
        <div className="mt-8 flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt="QR code" width={220} height={220} />
          <p className="mt-3 break-all text-center text-xs text-slate-400">{trackUrl}</p>
          <button
            onClick={() => window.print()}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-4 w-4" /> 列印
          </button>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        提示：標籤機（Brother PT-P710BT / NIIMBOT B1）可藍牙列印。熱感標籤長期留存建議改熱轉印。
      </p>
    </main>
  );
}
