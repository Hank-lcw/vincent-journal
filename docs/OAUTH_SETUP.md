# Meta / Threads / Canva / 小紅書授權

OAuth token 只回到 Worker，AES-GCM 加密後存 D1；前端不保存 access token。

## Facebook + Instagram
Facebook Login 取得可管理 Pages，並找出 Page 連結的 Instagram Professional account。

Redirect URI：
```
https://YOUR_DOMAIN/api/oauth/facebook/callback
```

主要權限：
- pages_show_list
- pages_read_engagement
- pages_manage_posts
- instagram_basic
- instagram_content_publish

正式供非 app tester 使用前，Meta 可能要求 App Review / Business verification。

## Threads
Redirect URI：
```
https://YOUR_DOMAIN/api/oauth/threads/callback
```

Scopes：
- threads_basic
- threads_content_publish

## Canva
Redirect URI：
```
https://YOUR_DOMAIN/api/oauth/canva/callback
```

使用 Authorization Code + PKCE。Brand Template 建議固定欄位：
- TITLE
- SUBTITLE
- CATEGORY
- IMAGE
- PAGE_NUMBER
- BRAND_NAME
- ISSUE
- QUOTE
- CAPTION

Autofill 永遠建立新 design，不覆蓋母版。

## 小紅書
預設流程：
1. Studio 生成簡體中文專屬文案及 Canva 圖卡
2. 人工審核
3. `ready_to_publish`
4. 透過官方允許的分享／發布流程交付

不以非官方 browser automation 模擬點擊發布。
