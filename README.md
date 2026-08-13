# ZipCodeTw

**現代化、高效能的台灣 3+3 郵遞區號與模糊門牌解析引擎**

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue)](https://wangicheng.github.io/zipcodetw/)

---

### 角色導航與文件分流 (Choose Your Role)

依據 **Diátaxis 檔案體系** 劃分多層級文件：

- **專案審查者 / 評審教授 (Reviewer / Professor)**：
  - 參閱 [`docs/SHOWCASE.md`](docs/SHOWCASE.md)（**30 秒極速精華摘要**：問題背景、四大資工核心亮點與 -94% 記憶體/-95% 冷啟動量化對比表）。
- **套件整合開發者 (SDK Integrator)**：
  - 參閱下方 [快速上手](#快速上手) 及完整的 [`docs/api.md`](docs/api.md)（**API 參考手冊**：涵蓋型別定義、方法參數與進階自訂介面）。
- **核心技術與演算法研習者 (Core Tech Deep-Diver)**：
  - 參閱 [`ARCHITECTURE.md`](ARCHITECTURE.md)（**核心系統架構**：二進位 Buffer 佈局、Front Coding 隨機存取、Bitmask 索引與 AST 語法樹）。
  - 參閱 [`RESEARCH_REPORT.md`](RESEARCH_REPORT.md)（**完整學術研究白皮書**：微基準測試、區塊超參數敏感度分析與 Pareto 邊界）。
- **產品體驗者 (End User)**：
  - 直接造訪 [線上 Demo 演示頁面 (Live Demo)](https://wangicheng.github.io/zipcodetw/) 進行互動式門牌查詢體驗。

---

## 核心特色

- **極致效能與零冷啟動**：
  - **Block-Based Front Coding**：將全台門牌前綴壓縮至極小二進位檔，具備 $O(1)$ 定點隨機存取能力。
  - **Zero-Expansion 零展開**：查詢時僅針對 1~3 條候選 ID 進行惰性解碼，V8 Heap 堆記憶體淨增長 **0.00 MB**，冷啟動響應耗時僅 **12 ms (-95%)**。
- **全平臺與 100% 離線相容**：
  - 支援 **Browser** (純前端離線查詢，Brotli 傳輸體積僅 791 KB)、**Server** (Node.js/Bun) 與 **Edge** (Cloudflare Workers / AWS Lambda@Edge)。
- **複雜門牌規則解析**：
  - 內建基於 **Chevrotain** 的門牌規則語法分析器，精確解析中華郵政 79,876 筆複雜投遞條件（單雙號、起訖範圍、地下樓層、含附號等）。

---

## 快速上手

### 1. 安裝套件

```bash
bun add zipcodetw
# 或使用 npm / pnpm / yarn
npm install zipcodetw
```

### 2. 瀏覽器端 (Browser)

```typescript
import { ZipCodeTw } from 'zipcodetw';

// 載入二進位資產檔 (極小 791 KB Brotli 傳輸)
const zipCodeTw = await ZipCodeTw.create(
  '/data/address_prefixes.bin',
  '/data/zipcode_rules.bin'
);

const matches = zipCodeTw.search('台北市大安區和平東路三段1號');
console.log(matches[0].zipcode);  // "106008" (6 碼郵遞區號)
console.log(matches[0].zipcode3); // "106"    (3 碼郵遞區號)
```

### 3. 伺服器端 (Node.js / Bun)

```typescript
import { createZipCodeTw } from 'zipcodetw/node';

// 自動尋找並讀取本地二進位資產 (零記憶體展開)
const zipCodeTw = await createZipCodeTw();
const matches = zipCodeTw.search('新竹市東區科學園區力行路');
console.log(matches[0].zipcode); // "300096"
```

---

## SDK 整合範例

### 範例：連動下拉選單 (Cascading Select)

利用 `getCities()` 與 `getDistricts(city)` 實作縣市/鄉鎮區連動選單與門牌即時查詢：

```html
<select id="city-select"></select>
<select id="district-select"></select>
<input id="detail-input" placeholder="請輸入門牌地址 (例如: 和平東路三段1號)" />
<span id="zipcode-badge"></span>

<script type="module">
  import { ZipCodeTw } from 'zipcodetw';

  const zipCodeTw = await ZipCodeTw.create('/data/address_prefixes.bin', '/data/zipcode_rules.bin');
  
  const citySelect = document.getElementById('city-select');
  const districtSelect = document.getElementById('district-select');
  const detailInput = document.getElementById('detail-input');
  const zipcodeBadge = document.getElementById('zipcode-badge');

  // 1. 初始化縣市選項
  citySelect.innerHTML = zipCodeTw.getCities().map(c => `<option value="${c}">${c}</option>`).join('');

  // 2. 當縣市改變時更新鄉鎮區選單
  const updateDistricts = () => {
    const districts = zipCodeTw.getDistricts(citySelect.value);
    districtSelect.innerHTML = districts.map(d => `<option value="${d}">${d}</option>`).join('');
    updateZipcode();
  };

  // 3. 輸入門牌時即時計算 6 碼郵遞區號
  const updateZipcode = () => {
    const fullAddress = `${citySelect.value}${districtSelect.value}${detailInput.value}`;
    const [match] = zipCodeTw.search(fullAddress);
    zipcodeBadge.textContent = match ? match.zipcode : '無匹配結果';
  };

  citySelect.addEventListener('change', updateDistricts);
  districtSelect.addEventListener('change', updateZipcode);
  detailInput.addEventListener('input', updateZipcode);

  updateDistricts();
</script>
```

---

## 專案與文件結構 (Directory Layout)

```
zipcodetw/
├── README.md              # [門面] 包名、角色導航導覽、極簡 Quick Start (本檔案)
├── ARCHITECTURE.md        # [架構解說] 二進位 Buffer 佈局、Front Coding 演算法與 AST 設計
├── RESEARCH_REPORT.md     # [研究白皮書] 學術研究報告、效能微基準測試與超參數敏感度分析
├── docs/                  # [詳細文件目錄]
│   ├── SHOWCASE.md        # [專案亮點] 30 秒極速精華報告（給教授/審查委員的 Overview）
│   └── api.md             # [API 手冊] 完整 TypeScript 介面定義與函式說明
└── packages/
    ├── zipcodetw/         # 核心 SDK 原始碼與資料編譯器
    └── demo/              # 獨立的 Demo 網頁 (GitHub Pages 部署)
```

---

## 開發與建置指令

| 指令 | 說明 |
|------|------|
| `bun run build:data` | 建置核心資料：自動下載中華郵政最新官方開放資料並編譯為二進制檔 |
| `bun test` | 執行核心單元測試 (包含 Parser、搜尋邏輯與解碼驗證) |
| `bun run dev` | 在 `packages/demo` 啟動靜態展示網頁開發伺服器 |
| `bun run build` | 完整建置核心資料資產與 Demo 靜態網站 |

---

## 授權條款 (License)

本專案採用 [MIT License](LICENSE) 授權釋出。
