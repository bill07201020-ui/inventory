# 齒模假牙進度追蹤系統 — 安裝與設定

## 技術棧

Next.js (App Router) + TypeScript / Supabase (Postgres + Auth + Storage + RLS) / Tailwind CSS + lucide-react / qrcode

-----

## 1. 建立 Supabase 專案

1. 到 https://supabase.com 建立新專案，記下：
- Project URL
- `anon` public key
- `service_role` key（**只在後端用，絕不可進前端 bundle**）
2. 進 SQL Editor，貼上並執行 `schema.sql`（一次跑完，含資料表、RLS、觸發器、`patient_track` 函式、Storage bucket）。
3. 確認 Storage 出現 private bucket `case-photos`。

-----

## 2. 環境變數

專案根目錄建 `.env.local`：

```bash
# 前端可讀（NEXT_PUBLIC 開頭）
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# 僅後端 / Edge Function 使用，勿加 NEXT_PUBLIC
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# QR / 查詢頁網址（印在標籤上的 base URL）
NEXT_PUBLIC_TRACK_BASE_URL=https://track.yourdental.com.au/track
```

> Vercel 部署時，同樣這幾個 key 加到 Project → Settings → Environment Variables。
> `SUPABASE_SERVICE_ROLE_KEY` 設為 Server 環境，不要勾選暴露給瀏覽器。

可直接複製 `.env.local.example` 為 `.env.local` 後填入真實值。

-----

## 3. 安裝套件

```bash
npm install
```

（已在 `package.json` 內含 `@supabase/supabase-js`、`qrcode`、`lucide-react`、Tailwind 等。）

若要手動安裝：

```bash
npm install @supabase/supabase-js qrcode lucide-react
npm install -D @types/qrcode tailwindcss postcss autoprefixer
```

中文字型：`app/layout.tsx` 已用 `next/font/google` 引入 Noto Sans TC。

-----

## 4. Supabase Client 初始化

- `lib/supabase.ts` — 前端用 anon key。
- `lib/supabaseAdmin.ts` — 後端用 service_role（給 signed URL / 限流），不會進前端 bundle。

-----

## 5. 三個串接點

### (a) 病患查詢

前端呼叫 `patient_track` RPC（見 `app/track/page.tsx`），取回的 `delivered_photo` 是 storage path，
再呼叫 `app/api/photo-url/route.ts` 換 10 分鐘有效的 signed URL。

### (b) 技師拍照上傳（登入後）

見 `app/dashboard/page.tsx` 與 `lib/imageCompress.ts`：
上傳前用 canvas 縮到 ~1200px → `image/webp`，0.85 品質，再 upload 到 `case-photos`，
寫入 `case_photos`，並更新 `cases.stage`（觸發器自動寫 `case_status_log` + `received_at` / `delivered_at`）。

### (c) QR 標籤

見 `app/dashboard/label/page.tsx`：用 `qrcode` 產生 `${NEXT_PUBLIC_TRACK_BASE_URL}/${caseId}` 的 data URL。

-----

## 6. 病患查詢限流（防暴力猜測）

`middleware.ts` 對 `/api/track` 同 IP 每分鐘限 5 次（用 Supabase `rate_limit` 表）。
量大時可改用 Upstash Redis。

-----

## 7. Auth（診所 / 技工所登入）

- 用 Supabase Auth（Email + 密碼，或 Magic Link）。
- 使用者註冊後，在 `profiles` 補 `org_id` 與 `role`（clinic / lab / admin）。
- `schema.sql` 已含 `on auth.users insert` 觸發器自動建 profile，再由 admin 指派 org。

-----

## 8. 上線檢查清單

- [ ] schema.sql 已執行，RLS 全部 enabled
- [ ] bucket `case-photos` 為 private
- [ ] service_role key 沒進前端 bundle
- [ ] 病患查詢只回傳安全欄位（無完整電話）
- [ ] 送達照走 signed URL，未開放 anon 直讀
- [ ] 查詢頁有 IP 限流
- [ ] 標籤機（Brother PT-P710BT / NIIMBOT B1）藍牙列印 QR 測試成功
- [ ] 熱感標籤褪色提醒：假牙週期短可接受，長期留存改熱轉印

-----

## 本機開發

```bash
npm run dev
# http://localhost:3000
```

-----

## 9. 部署到 Cloudflare Workers

本專案用 [OpenNext](https://opennext.js.org/cloudflare) 轉成 Cloudflare Worker，
worker 名稱為 `denture-tracking`（見 `wrangler.jsonc`）。

### 方式 A：Git 連結（推薦，免在本機放 token）

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository**，選此 repo。
2. Build command：`npm run deploy`（或 `opennextjs-cloudflare build`），deploy 由 Cloudflare 接手。
3. **環境變數**（Build / Production 都要）：
   - 建置期注入（`NEXT_PUBLIC_*`）：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_TRACK_BASE_URL`
   - Runtime secret：`SUPABASE_SERVICE_ROLE_KEY`（設為 Secret，勿暴露）

### 方式 B：本機 CLI 部署

```bash
npx wrangler login                       # 或 export CLOUDFLARE_API_TOKEN=...
# 設定 runtime secret
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# NEXT_PUBLIC_* 需在 build 時存在（放 .env.local 或 shell env）
npm run deploy
```

本機預覽 Worker：`npm run preview`。

> 注意：`NEXT_PUBLIC_*` 會在 **build 期**被內嵌進 bundle，部署前務必確保這些值存在；
> `SUPABASE_SERVICE_ROLE_KEY` 只走 runtime secret，不會進前端。
