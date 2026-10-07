# Cloudflare 上線設定

## 架構

VINCENT JOURNAL 採一個 Cloudflare Worker 同時處理：

- Static Assets：前台、文章閱讀頁、VINCENT STUDIO
- Worker API：`/api/*`
- D1：文章、版本、訂閱者、審核、OAuth metadata、jobs、audit log
- R2 `vincent-journal-media`：原始圖片、AI 圖片與衍生素材
- R2 `vincent-journal-backups`：每日長期 JSON 備份
- Cloudflare Access：只保護 Studio 與 admin API

## 1. 建立 Cloudflare 資源

安裝並登入 Wrangler：

```bash
npm install
npx wrangler login
```

建立 D1：

```bash
npx wrangler d1 create vincent-journal
```

把回傳的 `database_id` 寫進 `wrangler.jsonc`。

建立 R2：

```bash
npx wrangler r2 bucket create vincent-journal-media
npx wrangler r2 bucket create vincent-journal-backups
```

執行 migration：

```bash
npx wrangler d1 migrations apply vincent-journal --remote
```

## 2. 填入一般變數

在 `wrangler.jsonc` 修改：

- `PUBLIC_BASE_URL`：第一階段使用 Workers.dev，格式為 `https://vincent-journal.<你的 Workers 子網域>.workers.dev`
- `BOOTSTRAP_ADMIN_EMAIL`：已設定為 `andyhank1234567890@gmail.com`
- `MAIL_FROM`
- `RESEND_SEGMENT_ID`
- 各 OAuth redirect URI

`META_GRAPH_VERSION` 狀態會隨 Meta 版本演進；不要把平台版本散落寫死在程式各處，只改這一個變數即可。

## 3. Cloudflare Access

在 Cloudflare Zero Trust → Access → Applications 建立 Self-hosted application。

建議同一個 Access application 加入兩個受保護 hostname/path，使它們共用同一個 Audience (`aud`)：

- `journal.example.com/studio*`
- `journal.example.com/api/admin/*`

Policy 只允許你的管理員 Email / Identity Provider 群組。

把 Application Audience (`AUD`) 填入 `POLICY_AUD`，Team domain 填入：

```text
TEAM_DOMAIN=https://YOUR-TEAM.cloudflareaccess.com
```

Worker 不只依賴 Access 邊界：它還會自行驗證 `Cf-Access-Jwt-Assertion` 的簽章、issuer、audience、expiry。

## 4. Secrets

產生 AES-256 token vault key：

```bash
node scripts/generate-key.mjs
```

然後逐一設定：

```bash
npx wrangler secret put TOKEN_ENCRYPTION_KEY_B64
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_WEBHOOK_SECRET
npx wrangler secret put CANVA_CLIENT_ID
npx wrangler secret put CANVA_CLIENT_SECRET
npx wrangler secret put META_APP_ID
npx wrangler secret put META_APP_SECRET
npx wrangler secret put THREADS_APP_ID
npx wrangler secret put THREADS_APP_SECRET
```

選用：

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put XHS_CLIENT_ID
npx wrangler secret put XHS_CLIENT_SECRET
```

**Secrets 不得 commit 到 GitHub。**

## 5. Deploy

```bash
npm run typecheck
npm run deploy
```

完成後開：

- 公開站：`https://YOUR_DOMAIN/`
- 後台：`https://YOUR_DOMAIN/studio.html`
- 系統狀態：後台 → 系統與權限

## 6. GitHub + Cloudflare Builds

將 repo 連到 Cloudflare Workers Builds，Production branch 設 `main`。

Cloudflare 綁定的 D1 / R2 / Secrets 仍由 Cloudflare account 管理，不要放到 repository。

## 7. 備份

D1 Time Travel 是短期 point-in-time recovery 的第一層。Worker 另外每天 03:17 UTC 將核心表輸出成 JSON 放進 `vincent-journal-backups` R2。

安全考量：長期 JSON 備份**不包含 OAuth access/refresh token 密文與 nonce**；第三方帳號在完整災難復原後可重新授權。

可在後台「系統與權限」手動建立額外備份。

## 本專案目前選定的第一階段網址

先使用 Cloudflare Workers.dev，不先購買正式網域。

預期格式：

```text
https://vincent-journal.andyhank1234567890.workers.dev
```

真正的 Workers 子網域要在 Cloudflare 帳號建立第一個 Worker / 啟用 workers.dev 後才能確定，因此 repository 目前保留 `andyhank1234567890`；拿到後只需替換一處，再同步 OAuth redirect URI。

## 已建立的 D1

- Database name: `vincent-journal`
- Database ID: `f0254d4a-c7ef-4362-bedd-5417f25ba779`

## 已建立的 R2 Buckets

- `vincent-journal-media` — 已建立，Private，Automatic / Asia Pacific，Standard
- `vincent-journal-backups` — 已建立，Private，Automatic / Asia Pacific，Standard
