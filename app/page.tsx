import Link from "next/link";
import { Search, LogIn } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
      <h1 className="text-3xl font-bold text-slate-800">齒模假牙進度追蹤系統</h1>
      <p className="mt-3 text-center text-slate-500">
        查詢您的假牙製作進度，或登入管理案件。
      </p>

      <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/track"
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-md"
        >
          <Search className="h-8 w-8 text-sky-600" />
          <span className="text-lg font-medium text-slate-800">病患查詢進度</span>
          <span className="text-sm text-slate-400">姓名 + 電話末四碼</span>
        </Link>

        <Link
          href="/login"
          className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition hover:shadow-md"
        >
          <LogIn className="h-8 w-8 text-emerald-600" />
          <span className="text-lg font-medium text-slate-800">診所 / 技工所登入</span>
          <span className="text-sm text-slate-400">上傳照片、更新階段</span>
        </Link>
      </div>
    </main>
  );
}
