"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Loader2, QrCode, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { compressToWebp } from "@/lib/imageCompress";
import { STAGES, STAGE_LABEL, type CaseStage } from "@/lib/stages";

type CaseRow = {
  case_id: string;
  patient_name: string;
  item_type: string | null;
  stage: CaseStage;
  created_at: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCase, setBusyCase] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cases")
      .select("case_id, patient_name, item_type, stage, created_at")
      .order("created_at", { ascending: false });
    setCases((data as CaseRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setAuthChecked(true);
      loadCases();
    });
  }, [router, loadCases]);

  async function onUpload(caseId: string, stage: CaseStage, file: File) {
    setBusyCase(caseId);
    try {
      const webp = await compressToWebp(file);
      const path = `${caseId}/${stage}/${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("case-photos")
        .upload(path, webp, { contentType: "image/webp" });
      if (upErr) throw upErr;

      await supabase.from("case_photos").insert({
        case_id: caseId,
        stage,
        photo_path: path,
      });
      // 更新階段 → 觸發器自動寫 case_status_log + received_at / delivered_at
      await supabase.from("cases").update({ stage }).eq("case_id", caseId);
      await loadCases();
    } catch (err) {
      alert(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setBusyCase(null);
    }
  }

  async function onStageChange(caseId: string, stage: CaseStage) {
    setBusyCase(caseId);
    await supabase.from("cases").update({ stage }).eq("case_id", caseId);
    await loadCases();
    setBusyCase(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">案件管理</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/label"
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <QrCode className="h-4 w-4" /> QR 標籤
          </Link>
          <button
            onClick={loadCases}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> 重新整理
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </div>

      {loading && <p className="mt-6 text-slate-400">載入中…</p>}

      {!loading && cases.length === 0 && (
        <p className="mt-6 text-slate-500">目前沒有案件。</p>
      )}

      <div className="mt-6 space-y-4">
        {cases.map((c) => (
          <div key={c.case_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">{c.patient_name}</h2>
                <p className="text-sm text-slate-400">
                  {c.item_type ?? "未指定類型"} · 目前：
                  <span className="font-medium text-slate-600">{STAGE_LABEL[c.stage]}</span>
                </p>
              </div>
              {busyCase === c.case_id && (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                value={c.stage}
                onChange={(e) => onStageChange(c.case_id, e.target.value as CaseStage)}
                disabled={busyCase === c.case_id}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>

              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
                <Camera className="h-4 w-4" /> 拍照上傳
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={busyCase === c.case_id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(c.case_id, c.stage, file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
