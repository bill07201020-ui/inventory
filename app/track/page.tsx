"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { STAGES, STAGE_LABEL, stageIndex, type CaseStage } from "@/lib/stages";

type TrackResult = {
  caseId: string;
  patientName: string;
  itemType: string | null;
  stage: CaseStage;
  receivedAt: string | null;
  deliveredAt: string | null;
  deliveredPhotoUrl: string | null;
};

export default function TrackPage() {
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TrackResult[] | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, last4 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "查詢失敗");
      setResults(json.results as TrackResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-800">查詢假牙製作進度</h1>
      <p className="mt-2 text-sm text-slate-500">請輸入姓名與電話末四碼。</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600">姓名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
            placeholder="王小明"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600">電話末四碼</label>
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
            placeholder="1234"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          查詢
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {results && results.length === 0 && (
        <p className="mt-6 text-center text-slate-500">查無資料，請確認姓名與末四碼。</p>
      )}

      {results && results.map((r) => (
        <CaseCard key={r.caseId} result={r} />
      ))}
    </main>
  );
}

function CaseCard({ result }: { result: TrackResult }) {
  const current = stageIndex(result.stage);
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{result.patientName}</h2>
        {result.itemType && (
          <span className="text-sm text-slate-400">{result.itemType}</span>
        )}
      </div>

      <ol className="mt-5 space-y-3">
        {STAGES.map((s, i) => {
          const done = i <= current;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                }`}
              >
                {i + 1}
              </span>
              <span className={done ? "font-medium text-slate-700" : "text-slate-400"}>
                {STAGE_LABEL[s.key]}
              </span>
            </li>
          );
        })}
      </ol>

      {result.stage === "delivered" && result.deliveredPhotoUrl && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-600">送達照片</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.deliveredPhotoUrl}
            alt="送達照片"
            className="w-full rounded-lg border border-slate-200"
          />
        </div>
      )}
    </div>
  );
}
