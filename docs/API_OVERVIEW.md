# API overview

## Public

- `GET /api/public/articles`
- `GET /api/public/articles/:slug`
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/verify?token=...`
- `GET /api/newsletter/unsubscribe?token=...`
- `POST /api/webhooks/resend`
- `GET /media/:id`

## Admin — Cloudflare Access required

- `GET /api/admin/me`
- `GET /api/admin/system/status`
- `GET/POST/PATCH /api/admin/staff...`
- `GET/POST/PATCH /api/admin/articles...`
- article `submit / approve / reject / publish / archive`
- article `revisions / restore`
- media `upload / generate / edit / visibility`
- newsletter subscribers / campaign list / create / approve / send
- integrations list / connect / disconnect
- Canva templates / dataset / autofill / asset import
- social drafts / submit / approve / publish
- backups list / create

API responses intentionally never include decrypted OAuth tokens.
