# ZipCodeTw

**現代化、高效能的台灣 3+3 郵遞區號查詢引擎**

[線上演示 (Live Demo)](https://wangicheng.github.io/zipcodetw/)

ZipCodeTw 是一個專為台灣地址設計的郵遞區號解析函式庫。它解決了傳統查表法無法處理模糊地址、中文數字混用以及複雜門牌規則（如單雙號、樓層、巷弄範圍）的問題。核心採用 TypeScript 開發，具備高效的壓縮演算法與搜尋索引，同時支援 Node.js、Bun 與瀏覽器環境。

## ✨ 特色功能

- **🚀 極致效能**：
  - 採用 **Front Coding** 演算法壓縮地址前綴，大幅降低資料體積。
  - 使用 Bitmap 索引與位元運算加速搜尋查詢。
- **🔍 智慧模糊搜尋**：
  - 支援非連續字串匹配（Subsequence Matching）。
  - 自動正規化中文數字（例：「七段」=「7段」、「一○一號」=「101號」）。
- **📐 複雜規則解析**：
  - 內建 Parser（基於 Chevrotain）精確解析中華郵政的複雜投遞規則。
  - 支援單雙號、範圍（至、含附號）、樓層（B1、2樓以上）等條件判斷。
- **🌐 雙端支援**：
  - **Browser**：支援 `Gzip` + `Streaming Decompression`，實現純前端離線查詢。
  - **Server**：支援 Node.js 與 Bun，適合高併發 API 服務。
- **🛠️ 自動化爬蟲**：
  - 內建驗證碼識別（Captcha Solver）與爬蟲腳本，可隨時從中華郵政取得最新數據。

## 📦 安裝與設置

本專案採用 **Bun** 作為套件管理器。

```bash
# 1. 安裝相依套件
bun install

# 2. 下載最新郵遞區號資料 (自動破解驗證碼爬取中華郵政)
bun run download

# 3. 建置與壓縮資料檔 (產出至 packages/zipcodetw/data)
bun run build:data
```

## 💻 快速上手

### 瀏覽器端 (Browser)

```typescript
import { ZipCodeTw } from 'zipcodetw';

// 透過 URL 載入壓縮的資料檔
const zipCodeTw = await ZipCodeTw.create(
  './data/address_prefixes.txt.gz',
  './data/zipcode_rules.json.gz'
);

const matches = zipCodeTw.search('台北市大安區和平東路三段');
console.log(matches[0].zipcode); // "106008"
```

### 伺服器端 (Node.js / Bun)

```typescript
import { createZipCodeTw } from 'zipcodetw/node';

const zipCodeTw = await createZipCodeTw();
const result = zipCodeTw.search('新竹市東區科學園區力行路');
```

## 📂 專案結構

- **packages/zipcodetw**
  - 核心邏輯庫。
  - `src/core`: 搜尋引擎、規則匹配器、資料型別。
  - `src/utils`: Front Coding 編解碼工具。
  - `scripts/crawler`: 中華郵政爬蟲與驗證碼識別模型。
  - `scripts/utils`: 地址規則語法解析器 (Parser)。
- **packages/demo**
  - 使用 Vanilla TS 建置的靜態演示網站。

## 🛠️ 開發指令

| 指令 | 說明 |
|------|------|
| `bun run download` | 執行爬蟲，下載原始 `raw_addresses.json` |
| `bun run build:data` | 讀取原始資料，進行正規化與壓縮，生成 `.gz` 檔 |
| `bun test` | 執行單元測試 (包含 Parser、搜尋邏輯驗證) |
| `bun run dev` | 在 `packages/demo` 啟動開發伺服器 |
