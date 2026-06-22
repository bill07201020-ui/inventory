import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // 預設即可：在 Cloudflare Workers 上跑 Next.js（含 SSR / API routes / middleware）。
  // 需要 incremental cache / R2 等進階功能時，可在此加入對應設定。
});
