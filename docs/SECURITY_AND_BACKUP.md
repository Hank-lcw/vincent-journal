# Security / Approval / Versioning / Backup

## 身分與角色
登入：Cloudflare Access。
- owner：最高權限
- admin：管理人員、整合、備份
- reviewer：核准／發布文章、電子報、社群
- editor：草稿、素材、送審；不能自行核准

第一位 owner 由 `BOOTSTRAP_ADMIN_EMAIL` bootstrap。

## 第三方 token
- 不放 LocalStorage
- 不回傳管理前端
- AES-256-GCM 加密後存 D1
- encryption key 只在 Worker Secret
- OAuth state 短效
- Canva 使用 PKCE

## 文章／刊物狀態
```
draft → in_review → approved → published
           ↘ reject → draft
```

## 版本
重要修改／狀態變更前寫入 `article_revisions`。還原後回到 draft，避免未審核內容直接覆蓋線上版本。

## Audit Log
保存 actor、action、entity、request ID、hashed IP、metadata、timestamp。原始 IP 不寫入 audit log。

## 圖片
R2 素材預設 private。只有公開文章／社群需要讀取的素材才切 public。

## Backups
- D1 Time Travel：短期 point-in-time recovery
- 每日 R2 JSON：額外長期備份
- OAuth token ciphertext / nonce 不進長期 JSON backup
- backup bucket 不公開

完整災難復原時，先恢復內容與 subscriber state，再重新授權第三方 OAuth。

## 額外邊界
- 已發布文章／刊物若修改會回到 draft，避免繞過 Reviewer。
- 已發布文章使用中的封面不能直接改回 private。
- 訂閱確認與退訂採 GET 顯示確認頁、POST 才改變狀態，降低郵件安全掃描器誤觸。
- 訂閱者 Email 僅 Owner／Admin 可在 Studio 查看。
- 最後一位 active owner 無法被停用或降權。
