# ZipCodeTw API 參考手冊

本文件提供 `zipcodetw` 套件的完整 API 介面說明、TypeScript 型別定義與自訂擴充指南。

## 目錄

- [核心類別：ZipCodeTw](#核心類別zipcodetw)
  - [靜態建構方法](#靜態建構方法)
  - [地名與門牌輔助方法](#地名與門牌輔助方法)
  - [實體查詢方法](#實體查詢方法)
- [Node.js / Bun 專用模組 (`zipcodetw/node`)](#nodejs--bun-專用模組-zipcodetwnode)
- [TypeScript 型別定義](#typescript-型別定義)
  - [SearchMatch](#searchmatch)
  - [ZipCodeTwOptions](#zipcodetwoptions)
  - [AddressRule](#addressrule)
- [進階擴充介面](#進階擴充介面)
  - [AddressNormalizer 正規化介面](#addressnormalizer-正規化介面)
  - [AddressRanker 排序介面](#addressranker-排序介面)
- [例外與錯誤處理](#例外與錯誤處理)

---

## 核心類別：ZipCodeTw

`ZipCodeTw` 為主要檢索引擎進入點。支援瀏覽器端（經由 URL 異步 fetch 資產）與雙端二進位 Buffer 直接載入。

### 靜態建構方法

#### `ZipCodeTw.create(prefixesUrl, rulesUrl, options?)`

透過 HTTP URL 載入二進制資產檔並建立 `ZipCodeTw` 實體（適用於瀏覽器前端或 CDN 載入）。

```typescript
static async create(
  prefixesUrl: string,
  rulesUrl: string,
  options?: ZipCodeTwOptions
): Promise<ZipCodeTw>
```

- **參數**：
  - `prefixesUrl` (`string`): `address_prefixes.bin` 資產檔的 URL 路徑。
  - `rulesUrl` (`string`): `zipcode_rules.bin` 資產檔的 URL 路徑。
  - `options` (`ZipCodeTwOptions`, 選填): 包含自訂 `normalizer` 與 `ranker` 的設定物件。
- **回傳值**：`Promise<ZipCodeTw>`
- **範例**：
  ```typescript
  import { ZipCodeTw } from 'zipcodetw';

  const zipCodeTw = await ZipCodeTw.create('/assets/address_prefixes.bin', '/assets/zipcode_rules.bin');
  ```

#### `ZipCodeTw.fromBinary(binaryPrefixes, binaryRules, options?)`

直接使用記憶體中的 `ArrayBuffer` 或 `Uint8Array` 建立 `ZipCodeTw` 實體（零展開記憶體模式）。

```typescript
static fromBinary(
  binaryPrefixes: ArrayBuffer | Uint8Array,
  binaryRules: ArrayBuffer | Uint8Array,
  options?: ZipCodeTwOptions
): ZipCodeTw
```

- **參數**：
  - `binaryPrefixes` (`ArrayBuffer | Uint8Array`): 前綴檔內容。
  - `binaryRules` (`ArrayBuffer | Uint8Array`): 規則檔內容。
  - `options` (`ZipCodeTwOptions`, 選填): 自訂設定。
- **回傳值**：`ZipCodeTw` 實體。

---

### 地名與門牌輔助方法

#### `ZipCodeTw.getCities()` / `instance.getCities()`

取得全台灣所有縣市名稱清單（如 `["臺北市", "新北市", ...]`）。

```typescript
static getCities(): string[]
public getCities(): string[]
```

- **回傳值**：`string[]`

#### `ZipCodeTw.getDistricts(city)` / `instance.getDistricts(city)`

取得指定縣市轄下的所有鄉鎮市區名稱清單。支援別名輸入（如 `"台北"` $\to$ `"臺北市"`）。

```typescript
static getDistricts(city: string): string[]
public getDistricts(city: string): string[]
```

- **參數**：
  - `city` (`string`): 縣市名稱或常見別名（如 `"台北"`、`"台中"`、`"台南"`）。
- **回傳值**：`string[]`（若找不到該縣市則回傳 `[]`）。

#### `ZipCodeTw.parseCityDistrict(address)`

將包含縣市與鄉鎮區的完整門牌地址字串拆解為縣市、鄉鎮區與剩餘門牌。

```typescript
static parseCityDistrict(address: string): {
  city: string;
  district: string;
  detail: string;
}
```

- **參數**：
  - `address` (`string`): 原始門牌地址字串。
- **回傳值**：
  - `city`: 匹配到的標準縣市名稱（如 `"臺北市"`）。
  - `district`: 匹配到的鄉鎮區名稱（如 `"大安區"`）。
  - `detail`: 扣除縣市與鄉鎮區後的剩餘地址（如 `"和平東路三段1號"`）。

---

### 實體查詢方法

#### `instance.getDataVersion()`

取得底層二進制資料庫的發布版本識別標籤（例如 `"2026.03"`）。

```typescript
public getDataVersion(): string
```

- **回傳值**：`string`（若為舊版無標籤之二進位檔則回傳 `"legacy"`）。
- **範例**：
  ```typescript
  console.log(zipCodeTw.getDataVersion()); // "2026.03"
  ```

#### `instance.search(address, threshold?)`

對門牌地址進行二進位位元指標交集與模糊比對，回傳精確的 6 碼與 3 碼郵遞區號。

```typescript
public search(address: string, threshold?: number): SearchMatch[]
```

- **參數**：
  - `address` (`string`): 待查詢之門牌地址字串（例如 `"臺北市大安區和平東路三段1號"`）。
  - `threshold` (`number`, 選填): 最大匹配回傳結果筆數（預設為 `1000`）。
- **回傳值**：`SearchMatch[]` 陣列（若無匹配結果則回傳 `[]`）。
- **範例**：
  ```typescript
  const matches = zipCodeTw.search('台北市大安區和平東路三段1號');
  if (matches.length > 0) {
    console.log(matches[0].zipcode); // "106008" (6 碼)
    console.log(matches[0].zipcode3); // "106" (3 碼)
    console.log(matches[0].part1); // "臺北市大安區和平東路"
    console.log(matches[0].part2); // "三段1號"
  }
  ```

---

## Node.js / Bun 專用模組 (`zipcodetw/node`)

為伺服器端環境提供自動讀取本地檔案系統二進位檔的便捷輔助函式。

### `createZipCodeTw(prefixesPath?, rulesPath?, options?)`

自動尋找並讀取本地二進位資產，建立 100% 零展開的 `ZipCodeTw` 實體。

```typescript
import { createZipCodeTw } from 'zipcodetw/node';

async function createZipCodeTw(
  prefixesPath?: string,
  rulesPath?: string,
  options?: ZipCodeTwOptions,
): Promise<ZipCodeTw>;
```

- **參數**：
  - `prefixesPath` (`string`, 選填): `address_prefixes.bin` 的本地路徑。若未填，預設會從套件 `data/` 目錄自動載入。
  - `rulesPath` (`string`, 選填): `zipcode_rules.bin` 的本地路徑。
  - `options` (`ZipCodeTwOptions`, 選填): 自訂組態。
- **回傳值**：`Promise<ZipCodeTw>`

---

## TypeScript 型別定義

### `SearchMatch`

地址查詢匹配結果介面：

```typescript
export interface SearchMatch {
  /** 匹配到的門牌前綴Part 1 (例: "臺北市大安區和平東路") */
  part1: string;

  /** 剩餘比對門牌規則Part 2 (例: "三段1號") */
  part2: string;

  /** 解析出的門牌號碼陣列 (例: [3, 1]) */
  part2Numbers: number[];

  /** 大宗收件戶名稱 (若無則為空字串) */
  bulkName: string;

  /** 6 碼郵遞區號 (例: "106008") */
  zipcode: string;

  /** 3 碼郵遞區號 (例: "106") */
  zipcode3: string;

  /** 匹配的規則數量 (選填) */
  ruleCount?: number;

  /** 規則門牌涵蓋範圍大小 (選填) */
  rangeSize?: number;
}
```

### `ZipCodeTwOptions`

初始化選項設定介面：

```typescript
export interface ZipCodeTwOptions {
  /** 自訂地址正規化器 */
  normalizer?: AddressNormalizer;
  /** 自訂結果排序評分器 */
  ranker?: AddressRanker;
}
```

### `AddressRule`

二進位門牌投遞條件規則結構：

```typescript
export interface AddressRule {
  /** 門牌單位 (例: '巷' | '弄' | '號' | '樓' | '附號') */
  unit?: string;
  /** 結束門牌單位 (例: '巷至號' -> unit: '巷', endUnit: '號') */
  endUnit?: string;
  /** 子號模式 (例: 'all' | 'more') */
  subMode?: string;
  /** 完全單點匹配門牌數值 */
  value?: number[];
  /** 門牌範圍下限 */
  min?: number[];
  /** 門牌範圍上限 */
  max?: number[];
  /** 單雙號性 (例: 'odd' | 'even' | 'all') */
  parity?: string;
}
```

---

## 進階擴充介面

`zipcodetw` 允許開發者透過依賴注入 (Dependency Injection) 自訂地址正規化與結果排序邏輯。

### `AddressNormalizer` 正規化介面

用於在查詢前清理與正規化使用者輸入的文字（例如將全形字轉半形、中文數字轉換為阿拉伯數字）：

```typescript
export interface AddressNormalizer {
  normalize(address: string): string;
}
```

- **預設實作**：`DefaultAddressNormalizer`
- **自訂範例**：
  ```typescript
  import { ZipCodeTw, DefaultAddressNormalizer } from 'zipcodetw';

  class CustomNormalizer extends DefaultAddressNormalizer {
    override normalize(address: string): string {
      const base = super.normalize(address);
      // 新增自訂正規化邏輯 (例如替換特定舊地名)
      return base.replace(/台北城/g, '臺北市中正區');
    }
  }

  const zipCodeTw = await ZipCodeTw.create(url1, url2, {
    normalizer: new CustomNormalizer(),
  });
  ```

### `AddressRanker` 排序介面

當單一地址存在多筆可能匹配項時，用於計算優先順序評分：

```typescript
export interface AddressRanker {
  rank(matches: SearchMatch[], rawQuery: string): SearchMatch[];
}
```

- **預設實作**：`PostalDeliveryRanker`（依門牌範圍精確度與大宗戶權重排序）。

---

## 例外與錯誤處理

1. **資產檔載入失敗** (`Error: Failed to fetch binary assets`):
   - **成因**：指定的 URL 無法讀取或 HTTP Response 狀態碼不為 200。
   - **解決方式**：請確認 `address_prefixes.bin` 與 `zipcode_rules.bin` 檔案路徑正確，且 Web 伺服器支援 MIME 類型（如 `application/octet-stream`）。

2. **Node.js 資產檔案找不到** (`Error: Buffer file not found`):
   - **成因**：`zipcodetw/node` 無法在預設候選路徑找到二進位檔。
   - **解決方式**：明確傳入絕對路徑，例如：`createZipCodeTw(path.resolve('./data/address_prefixes.bin'), path.resolve('./data/zipcode_rules.bin'))`。
