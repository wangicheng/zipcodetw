# zipcodetw

最快最方便的離線台灣 3+3 郵遞區號查詢系統。

- 即時反應
- 模糊查詢
- 條件匹配
- 離線運作

## 使用方式

本專案採用 Bun Workspace 管理，包含核心函式庫與 Demo 網站。

- 安裝相依套件：

```bash
bun install
```

- 產生地址資料檔（會於 `packages/zipcodetw/data` 產生壓縮後的資料檔）：

```bash
bun run build:data
```

- 啟動 Demo 網站：

```bash
cd packages/demo
bun run build    # 建置網站
bun run start    # 啟動預覽 (使用 bunx serve)
# 或
bun run dev      # 開發模式 (Watch mode)
```

## 套件結構

- `packages/zipcodetw`: 核心邏輯與資料處理腳本。
  - 支援 Node.js/Bun 後端 (含檔案讀取)。
  - 支援 Browser 前端 (純邏輯，需外掛資料)。
- `packages/demo`: 靜態 Demo 網頁範例。
