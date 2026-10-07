# VINCENT JOURNAL — production deploy checklist

這份清單的目標是確保管理後台、訂閱名單、OAuth token 與寄件網域從第一天就有合理的安全邊界。

## 0. GitHub
- [x] Repository：`Hank-lcw/vincent-journal`
- [x] 與 `vincents-note` 完全分離
- [x] Public repo 只放程式碼與空白環境變數範例
- [ ] GitHub repository secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
- [ ] API Token 僅授予本專案 Worker / D1 / R2 部署所需權限

GitHub Actions 已加保護：在 Cloudflare Secrets 尚未設定時，deploy job 會跳過，不會因初始 commit 持續失敗。

## 1. Cloudflare resources
- [x] 建立 D1：`vincent-journal`
- [x] 建立 R2：`vincent-journal-media`
- [x] 建立 R2：`vincent-journal-backups`
- [x] 把 D1 database ID 填入 `wrangler.jsonc`
- [ ] 決定正式網域，例如 `journal.<your-domain>`
- [ ] 替換 `PUBLIC_BASE_URL`、OAuth redirect URI、`MAIL_FROM`

## 2. Cloudflare Access
- [ ] 建立 Self-hosted Access Application
- [ ] 保護 `/studio*`
- [ ] 保護 `/api/admin/*`
- [ ] 只允許管理員 Email / IdP group
- [ ] 填入 `TEAM_DOMAIN`
- [ ] 填入 Application `POLICY_AUD`
- [ ] 填入第一位 Owner 的 `BOOTSTRAP_ADMIN_EMAIL`

Worker 會再次驗證 `Cf-Access-Jwt-Assertion`，不是只依賴前方 Access route。

## 3. Worker secrets
使用 `wrangler secret put <NAME>`，不要寫入 GitHub：
- [ ] `TOKEN_ENCRYPTION_KEY_B64`
- [ ] `OPENAI_API_KEY`
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_WEBHOOK_SECRET`
- [ ] `CANVA_CLIENT_ID`
- [ ] `CANVA_CLIENT_SECRET`
- [ ] `META_APP_ID`
- [ ] `META_APP_SECRET`
- [ ] `THREADS_APP_ID`
- [ ] `THREADS_APP_SECRET`
- [ ] `TURNSTILE_SECRET_KEY`（建議）

## 4. Database
- [ ] 執行 remote migration
- [ ] 首次以 bootstrap owner 登入
- [ ] 建立 Editor / Reviewer / Admin
- [ ] 測試 Editor 不可自行核准與發布

## 5. Email
- [ ] Resend 驗證寄件網域
- [ ] DNS 完成 SPF / DKIM
- [ ] 設定 DMARC
- [ ] 建立 Segment
- [ ] Webhook 指向 `/api/webhooks/resend`
- [ ] Double Opt-in 測試
- [ ] 退訂測試
- [ ] permanent bounce / complaint suppression 測試

## 6. OpenAI Images
- [ ] 設定 `OPENAI_API_KEY`
- [ ] 測試局部人像／靜物生成
- [ ] 測試 image edit 產生新版本
- [ ] AI 圖片預設 private
- [ ] 僅公開文章與社群素材切換 public

## 7. Meta / Threads
- [ ] 建立 Meta app
- [ ] Facebook Login redirect URI
- [ ] Page 發布權限
- [ ] Instagram Professional account
- [ ] Threads redirect URI
- [ ] 使用測試帳號先完成發布流程
- [ ] 保留 Reviewer 人工核准

## 8. Canva
- [ ] OAuth callback
- [ ] Brand Template / design autofill / asset scopes
- [ ] 建立 VINCENT JOURNAL Brand Templates
- [ ] Autofill fields：`TITLE`, `SUBTITLE`, `EXCERPT`, `CATEGORY`, `IMAGE`, `BRAND_NAME`, `ISSUE`, `PAGE_NUMBER`, `QUOTE`, `CAPTION`
- [ ] 測試 Autofill 產生新 design
- [ ] 不直接覆蓋母版

## 9. 小紅書
- [ ] 維持 `Ready to Publish`
- [ ] 簡體／在地化文案＋Canva 圖卡
- [ ] 人工檢查醫療健康及 AI 輔助標示
- [ ] 不用非官方瀏覽器自動化繞過平台

## 10. Backup / Launch
- [ ] 手動建立一次 R2 JSON backup
- [ ] 確認每日 cron
- [ ] 確認 D1 Time Travel
- [ ] 完整 E2E：登入 → 圖片 → 文章 → 送審 → 核准 → 發布 → 訂閱 → 驗證 → 電子報 → 社群草稿
- [ ] E2E 全數通過後才正式導流

## Runtime D1
- [x] Auto-provisioned production D1: `vincent-journal-runtime`
- [x] Database ID pinned: `50dc4b25-df3a-4cfd-b496-a037ac65a999`
- [ ] Cloudflare Build deploy command changed to `npm run deploy:cloudflare`
- [x] Confirm migration creates the production tables (verified via sqlite_master; table_count = 19)

- [ ] Fresh build after deploy-command change (do not rely on retrying an older build snapshot)

## Next: Cloudflare Access
- [ ] Remove any production-wide Access protection from the public Worker URL
- [ ] Keep Preview URLs protected
- [ ] Create path-scoped Access protection for `/studio*`
- [ ] Create path-scoped Access protection for `/api/admin/*`
- [ ] Allow only `andyhank1234567890@gmail.com`
- [x] Record Team Domain and Application AUD in `wrangler.jsonc`
- [ ] Verify first login bootstraps owner role

### Access JWT values
- Team Domain: `https://andyhank1234567890.cloudflareaccess.com`
- Application AUD: `7dd196f9be1362f0dcd1b39f50ab859d2545c18b94ecbea156da4981df16b65c`
