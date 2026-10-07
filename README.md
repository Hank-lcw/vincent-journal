# VINCENT JOURNAL v1.6 — Cloudflare production scaffold

**AESTHETICS · HEALTHY AGING · LONGEVITY**

VINCENT JOURNAL 是以精品雜誌式閱讀體驗為前台、VINCENT STUDIO 為內容中樞的醫學美學內容平台。這一版將原型升級為 Cloudflare 全端架構：Workers Static Assets + Worker API、D1、R2、Cloudflare Access、電子報、AI 圖片、社群發布與 Canva 串接。

## Production architecture

- Cloudflare Access JWT + D1 角色權限：`owner / admin / reviewer / editor`
- D1：文章、版本、訂閱者、審核、OAuth metadata、jobs、audit log
- R2：私人媒體素材、公開發布素材、長期備份
- OpenAI Images：圖片生成與修改
- Resend：Double Opt-in、寄送、退訂、bounce / complaint suppression
- Meta / Threads：Facebook、Instagram、Threads 發布
- 小紅書：Ready to Publish 安全交付模式
- Canva：OAuth PKCE、Brand Template dataset、Autofill
- GitHub Actions：main 分支 typecheck → migration → Cloudflare deploy

## 安全原則

此 repository 為 Public 亦可使用，但**不得提交任何 API key、OAuth secret、Cloudflare token、寄件服務密鑰或使用者個資**。所有秘密只放 GitHub Secrets / Cloudflare Worker Secrets；repo 只保留 `.dev.vars.example`。

## 本機

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

## 正式部署前

1. 建立 D1 `vincent-journal`
2. 建立 R2 `vincent-journal-media`、`vincent-journal-backups`
3. 設定 Cloudflare Access
4. 將 `wrangler.jsonc` placeholder 換成真實值
5. 在 GitHub Secrets 設 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
6. 在 Cloudflare 設 Worker Secrets
7. 設定 Resend、Meta、Threads、Canva OAuth

完整清單見 `docs/DEPLOY_CHECKLIST.md`。
