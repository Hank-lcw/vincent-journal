# 電子報、網域與退信抑制

## Double Opt-in
讀者輸入 Email 後不會立刻進入正式名單：
1. Email 格式檢查
2. 基本網域檢查
3. 選用 Cloudflare Turnstile
4. 寄出一次性確認信
5. 點擊確認連結後才變成 `active`
6. 才同步寄件服務的正式受眾名單
7. 正式電子報只寄給 verified active contacts

## Resend
1. 建立寄件 Domain。
2. 將 SPF / DKIM DNS records 加入 Cloudflare DNS。
3. 建議設定 DMARC。
4. Domain verified 後再正式發刊。
5. 建立 VINCENT JOURNAL subscriber Segment，ID 填入 `RESEND_SEGMENT_ID`。

## Webhook
指向：
```
https://YOUR_DOMAIN/api/webhooks/resend
```
至少接收 bounce、complaint、suppression、unsubscribe。

Webhook signing secret 存入 `RESEND_WEBHOOK_SECRET`。Worker 以 webhook event ID 做 idempotency。

## Suppression
收到 hard bounce、spam complaint 或 provider suppression 後：
- `subscribers.status` → `suppressed`
- `suppressions` 保存原因
- 後續不得自動重新加入一般行銷寄件

一般退訂則為 `unsubscribed`。
