# ZipCodeTw

**現代化、高效能的台灣 3+3 郵遞區號查詢引擎**

[線上演示 (Live Demo)](https://wangicheng.github.io/zipcodetw/)

ZipCodeTw 是一個專為台灣地址設計的郵遞區號解析函式庫。它解決了傳統查表法無法處理模糊地址、中文數字混用以及複雜門牌規則（如單雙號、樓層、巷弄範圍）的問題。核心採用 TypeScript 開發，具備高效的壓縮演算法與搜尋索引，同時支援 Node.js、Bun 與瀏覽器環境。

> 👨‍🏫 **學術研究與技術報告**：如需了解專案的演算法設計（Front Coding）、語法樹解析（AST）以及詳細的效能與壓縮比測試數據，請參閱 [RESEARCH_REPORT.md](./RESEARCH_REPORT.md)。

## ✨ 特色功能

- **🚀 極致效能**：
  - 採用 **Front Coding** 演算法壓縮地址前綴，大幅降低資料體積。
  - 使用 Bitmap 索引與位元運算加速搜尋查詢。
- **🔍 智慧模糊搜尋**：
  - 支援非連續字串匹配。
  - 自動正規化中文數字（例：「七段」=「7段」、「一○一號」=「101號」）。
- **📐 複雜規則解析**：
  - 內建語法解析器（基於 Chevrotain）精確解析中華郵政的複雜投遞規則。
  - 支援單雙號、範圍（至、含附號）、樓層（B1、2樓以上）等條件判斷。
- **🌐 雙端支援**：
  - **Browser**：支援純前端離線查詢，可透過 Web 伺服器 / CDN 標頭（Content-Encoding: br / gzip）輕鬆達成極小傳輸。
  - **Server**：支援 Node.js 與 Bun，適合高併發 API 服務。
- **📦 高效資料建置**：
  - 輸入結構化的原始地址 JSON 檔（`raw_addresses.json`），經由編譯命令自動轉譯產出極小化之 Front Coding 前綴檔與 AST 規則索引檔。


## 📦 資料建置與流程

本專案採用 **Bun** 作為套件管理器。資料建置流程如下：

```bash
# 1. 安裝相依套件
bun install

# 2. 準備原始地址 JSON 檔
# 將符合格式的原始地址資料放置於 packages/zipcodetw/data/raw_addresses.json

# 3. 建置壓縮索引與規則檔 (產出 address_prefixes.txt 與 zipcode_rules.json)
bun run build:data
```

## 📄 原始地址資料規格 (raw_addresses.json)

`raw_addresses.json` 為建置指令 `bun run build:data` 的唯一輸入介面，該 JSON 檔案須為 `RawAddress` 物件構成的陣列：

### JSON 結構範例

```json
[
  {
    "city": "基隆市",
    "district": "七堵區",
    "road": "光明路",
    "section": "0",
    "range": "單  21號至  23號",
    "bulkName": "行政大樓",
    "zipcode": "206216"
  },
  {
    "city": "臺北市",
    "district": "大安區",
    "road": "和平東路",
    "section": "3",
    "range": "全",
    "bulkName": "",
    "zipcode": "106008"
  }
]
```

### 欄位規格說明

| 欄位名稱 (Field) | 型態 (Type) | 必填 | 說明與範例 |
| :--- | :--- | :---: | :--- |
| `city` | `string` | 是 | 縣市名稱（例：`"臺北市"`、`"基隆市"`） |
| `district` | `string` | 是 | 鄉鎮市區名稱（例：`"大安區"`、`"七堵區"`） |
| `road` | `string` | 是 | 路街名稱（例：`"和平東路"`、`"光明路"`） |
| `section` | `string` | 是 | 段別（若無段別請固定填 `"0"`，例：`"3"` 或 `"0"`） |
| `range` | `string` | 是 | 門牌投遞範圍規則描述（例：`"全"`、`"單  21號至  23號"`、`"雙 100號以下"`） |
| `bulkName` | `string` | 是 | 大宗戶/機構/大樓名稱（若無則填空字串 `""`，例：`"行政大樓"`） |
| `zipcode` | `string` | 是 | 6 碼郵遞區號字串（例：`"106008"`、`"206216"`） |

## 💻 快速上手

### 瀏覽器端

```typescript
import { ZipCodeTw } from 'zipcodetw';

// 透過 URL 載入資料檔
const zipCodeTw = await ZipCodeTw.create(
  './data/address_prefixes.txt',
  './data/zipcode_rules.json'
);

const matches = zipCodeTw.search('台北市大安區和平東路三段');
console.log(matches[0].zipcode); // "106008"
```

### 伺服器端（Node.js / Bun）

```typescript
import { createZipCodeTw } from 'zipcodetw/node';

const zipCodeTw = await createZipCodeTw();
const result = zipCodeTw.search('新竹市東區科學園區力行路');
```

### Web Component 表單選取組件 (`<tw-address-picker>`)

本函式庫內建原生 Web Component 組件，支援跨框架（HTML / Vue / React / Angular）無縫整合縣市/鄉鎮區選單、門牌帶入與 3+3 郵遞區號即時運算：

#### HTML 直接引用

```html
<script type="module">
  import 'zipcodetw';
</script>

<tw-address-picker 
  prefixes-url="./data/address_prefixes.txt" 
  rules-url="./data/zipcode_rules.json">
</tw-address-picker>
```

#### TypeScript / JavaScript 事件監聽

```typescript
import { TwAddressPicker, type AddressChangeEventDetail } from 'zipcodetw';

const picker = document.querySelector('tw-address-picker') as TwAddressPicker;

picker.addEventListener('address-change', (e: Event) => {
  const detail = (e as CustomEvent<AddressChangeEventDetail>).detail;
  console.log(detail.fullAddress); // "臺北市大安區和平東路三段1號"
  console.log(detail.zipcode);     // "106008" (6碼郵遞區號)
  console.log(detail.isExact);     // true (是否成功比對到正確郵遞區號)
});
```

## 📂 專案結構

```
zipcodetw/
└── packages/
    ├── zipcodetw/           # [核心引擎庫] 搜尋引擎、Front Coding 與規則解析
    │   ├── src/core/        # 核心搜尋與匹配邏輯
    │   ├── src/utils/       # Front Coding 編解碼工具
    │   ├── scripts/utils/   # 地址規則 AST 語法解析器 (Chevrotain)
    │   └── data/            # 壓縮索引與原始資料檔目錄
    └── demo/                # [靜態展示頁] Vanilla TS 展示網站範例
```

## 🛠️ 開發與建置指令

| 指令 | 說明 |
|------|------|
| `bun run build:data` | 讀取 `raw_addresses.json`，進行 Front Coding 編碼與 AST 規則結構化 |
| `bun test` | 執行核心單元測試 (包含 Parser、搜尋邏輯驗證) |
| `bun run dev` | 在 `packages/demo` 啟動靜態展示網頁開發伺服器 |
| `bun run build` | 完整建置核心資料檔與 Demo 靜態網站 |
