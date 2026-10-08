# API overview

## Public

- `GET /api/public/articles`
- `GET /api/public/articles/:slug`
- `GET /api/public/issues`
- `GET /api/public/issues/current`
- `GET /api/public/issues/:slug`
- `GET /api/public/config`
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/verify?token=...` → 顯示確認頁
- `POST /api/newsletter/verify` → 完成 Double Opt-in
- `GET /api/newsletter/unsubscribe?token=...` → 顯示退訂確認頁
- `POST /api/newsletter/unsubscribe` → 完成退訂
- `POST /api/webhooks/resend`
- `GET /media/:id`

## Admin — Cloudflare Access required

- `GET /api/admin/me`
- `GET /api/admin/system/status`
- `GET/POST/PATCH /api/admin/staff...`
- `GET/POST/PATCH /api/admin/articles...`
- article `submit / approve / reject / publish / archive`
- article `revisions / restore`
- issues list / create / edit / article ordering / submit / approve / reject / publish / archive
- media `upload / generate / edit / visibility`
- newsletter subscribers / campaign list / create / edit / submit / approve / reject / schedule / send
- integrations list / connect / disconnect
- Canva templates / dataset / autofill / asset import
- social drafts / edit / AI copy / submit / approve / reject / schedule / publish
- backups list / create

API responses intentionally never include decrypted OAuth tokens.
