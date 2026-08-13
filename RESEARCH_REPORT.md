# ZipCodeTw 全二進制零展開郵遞區號解析引擎研究報告

> **文件體系導航**：
> - 專案門面與快速上手：[`README.md`](README.md)
> - 核心架構與記憶體佈局：[`ARCHITECTURE.md`](ARCHITECTURE.md)
> - 30 秒評審與技術亮點：[`docs/SHOWCASE.md`](docs/SHOWCASE.md)
> - 完整 API 參考手冊：[`docs/api.md`](docs/api.md)

## 1. 研究背景與業界既有解決方案

台灣 3+3 碼郵遞區號系統涵蓋全台 **79,876 筆** 門牌對照規則。其結構包含單雙號、連號、附號（如 `1之23號`）、樓層與地下室（如 `2樓以上`、`地下1樓至1樓`）等多維度條件。

在 ZipCodeTw 專案出現之前，業界在處理台灣地址解析與 3+3 郵遞區號對照時，主要採用以下幾種一般解決方案：

### 1.1 伺服器端關聯式資料庫查詢 (RDBMS / SQL LIKE / SQLite)
- **原理**：將中華郵政官方 `rall1.dbf` 資料庫匯入 MySQL、PostgreSQL 或 SQLite 等資料庫。在使用者輸入地址時，透過 SQL `LIKE` 子句或正則表達式進行文字與數字範圍匹配。
- **主要瓶頸**：
  1. **強依賴伺服器與網路**：前端或行動端無法離線查詢，每次查詢需負擔網路往返延遲（RTT 50~200ms）。
  2. **查詢效率與高併發開銷**：地址比對涉及模糊前綴與複雜字串計算，難以充分利用傳統 B-Tree 索引，高併發時會給資料庫帶來高昂 CPU 負載與查詢開銷。

### 1.2 官方 / 第三方在線 REST API (Chunghwa Post Web API)
- **原理**：直接呼叫中華郵政或第三方雲端服務提供的 REST Web API 介面。
- **主要瓶頸**：
  1. **外部依賴與網路風險**：第三方 API 存在服務中斷、限速（Rate Limit）及回應延遲問題。
  2. **無法用於邊緣與批次運算**：若有數萬筆地址需進行批次清洗與郵遞區號補全，發送數萬次 HTTP 請求將導致嚴重的效能瓶頸。

### 1.3 傳統前端 / Node 記憶體 JSON/JS 物件樹展開法 (In-Memory JSON Object Trees)
- **原理**：將門牌對照表於建置期轉為 JSON 格式（如 6~12 MB 之 JSON 檔案），並在應用程式啟動時透過 `JSON.parse()` 將完整資料展開為前端或 Node.js 記憶體中的 JS 物件/Map 搜尋樹。
- **主要瓶頸**：
  1. **傳輸體積龐大**：前端瀏覽器需下載數 MB 的 JSON 或 JS 檔，極度消耗使用者頻寬。
  2. **記憶體與 GC 負擔沉重**：將數萬筆規則展開為 JS 物件與字串時，會產生逾 44,000 個字串物件與 79,000 個規則物件，導致 V8 Heap 堆記憶體與進程 RSS 暴增 160 MB 以上，引發頻繁 GC 停頓。
  3. **冷啟動延遲高昂**：JSON 解析與記憶體物件樹建置耗時 200 至 250 毫秒，無法滿足現代 Serverless / Cloudflare Workers 零冷啟動（Zero-Cold-Start）需求。

---

## 2. 二進位資產架構與核心技術

為徹底突破上述傳統一般解決方案在傳輸體積、冷啟動耗時、記憶體開銷與部署靈活性上的瓶頸，ZipCodeTw 設計了**全二進制零展開（Dual Binary Zero-Expansion）架構**。

本系統將 79,876 筆官方資料編譯為兩份極小化且結構化的自訂二進位資產：`address_prefixes.bin` 與 `zipcode_rules.bin`。

```
[ 中華郵政 rall1.dbf (12.2 MB) ]
         │
         ▼ (純 TypeScript DBFReader 記憶體解析)
[ 記憶體 RawAddress 陣列 ]
         │
         ▼ (二進制編譯器)
┌─────────────────────────────────────┬─────────────────────────────────────┐
│    address_prefixes.bin (1.24 MB)   │      zipcode_rules.bin (1.33 MB)    │
│  (區塊化 Front Coding + 預建倒排索引)│    (定長 Index Table + Bitmask 標頭) │
└─────────────────────────────────────┴─────────────────────────────────────┘
         │                                     │
         └──────────────────┬──────────────────┘
                            ▼
           [ BinaryPrefixSearchEngine ] 
           [     BinaryRuleStore      ]
           (靜態 Uint8Array 零複製比對)
```

### 2.1 門牌前綴區塊化前綴編碼 (Block-Based Binary Front Coding)

台灣地名與門牌具有極高的行政區劃與路名前綴重疊性（例如 `臺北市大安區和平東路一段`、`臺北市大安區和平東路二段`、`臺北市大安區和平東路三段` 等，前面 9 個 Unicode 字元完全一致）。若採用傳統平鋪字串陣列儲存全台 **44,658 條** 不重複門牌前綴，會產生大量重複的 UTF-8 位元組。

本專案採用 **Front Coding (增量前綴編碼)** 演算法配合 **Block-Based 區塊化設計** 進行資料壓縮與隨機存取：

#### 2.1.1 Front Coding 演算法概念與純 UTF-8 位元組標頭結構 (Byte Count)

Front Coding 的核心原則為：先將全量門牌前綴字串依 Unicode 字典序排序，後續字串僅需記錄「與前一條字串相同的公共前綴 UTF-8 位元組長度 (`shared`)」以及「剩餘差異尾綴 (`remainder`)」。

實務上，台灣門牌前綴極少超過 20 個字（即約 60 個 UTF-8 位元組），遠小於 `uint8` 標頭的 255 位元組上限（可容納高達 85 個中文字）。因此，本系統直接使用 **UTF-8 位元組數 (Byte Count)** 作為 `shared` 單位，實現真正的純二進位零 JS 物件開銷：

| 欄位名稱 | 型態 / 長度 | 單位與說明 |
| :--- | :---: | :--- |
| `shared` | `uint8` (1 byte) | **UTF-8 位元組長度 (Byte Length)**：與同區塊前一條字串重疊的 UTF-8 位元組數（直接用於 Uint8Array 位元組拷貝） |
| `remLen` | `uint8` (1 byte) | **UTF-8 位元組長度 (Byte Length)**：剩餘差異字串在二進位 Buffer 中佔用的位元組長度 |
| `remStr` | `Uint8Array` (`remLen` bytes) | 剩餘差異字串之 UTF-8 原始位元組串流 |

> [!NOTE]
> **區塊錨點字串 (Anchor String, offsetInBlock = 0)**：每個 Block 的首條字串不使用 1 位元組 `shared`，而是寫入 2 位元組 `uint16` 之 **全量 UTF-8 位元組總長度 (`anchorLen`)**（例如 `臺北市大安區和平東路一段` 為 39 個 UTF-8 位元組），後隨全量 UTF-8 位元組串流。

**編碼範例說明與欄位對照**：

假設某個 Block 前三條門牌前綴如下（每個中文字在 UTF-8 佔 3 位元組）：

1. **第 0 條 (Anchor String)**：`臺北市大安區和平東路一段`
   - 全量 13 個中文字 $\rightarrow$ 欄位儲存：`anchorLen = 39` bytes。
2. **第 1 條**：`臺北市大安區和平東路二段`
   - 重疊前綴：`臺北市大安區和平東路`（9 個中文字 = 27 bytes） $\rightarrow$ **`shared = 27` (UTF-8 位元組數)**
   - 差異尾綴：`二段`（2 個中文字 = 6 bytes） $\rightarrow$ **`remLen = 6` (UTF-8 位元組數)**, `remStr` = `0xE4 0xBA 0x8C 0xE6 0xAE 0xB5`
3. **第 2 條**：`臺北市大安區和平東路三段`
   - 重疊前綴：`臺北市大安區和平東路`（9 個中文字 = 27 bytes） $\rightarrow$ **`shared = 27` (UTF-8 位元組數)**
   - 差異尾綴：`三段`（2 個中文字 = 6 bytes） $\rightarrow$ **`remLen = 6` (UTF-8 位元組數)**, `remStr` = `0xE4 0xB8 0x89 0xE6 0xAE 0xB5`

**純 Uint8Array 延遲解碼效能優勢 (Empirical Benchmark Results)**：

在解碼端 [BinaryPrefixSearchEngine](packages/zipcodetw/src/core/BinaryPrefixSearchEngine.ts) 中，全區塊遞迴解碼完全在 `Uint8Array` 靜態記憶體 Buffer 上進行位元組複製，**無須為中間的中斷字串呼叫 `TextDecoder('utf-8')` 或產生中間 JS String 物件**。僅在抵達目標 ID 時呼叫一次 `TextDecoder` 解碼：

```typescript
currentBytes.set(this.buffer.subarray(cursor, cursor + remLen), sharedBytes);
currentLen = sharedBytes + remLen;
```

實測對全台 44,658 條真實門牌前綴進行解碼效能量測：
- **二進位資產體積**：前綴結構體積壓縮至 **400.05 KB**（含文字流 394.60 KB 與區塊索引表 5.45 KB；實體檔 `address_prefixes.bin` 包含倒排索引後為 1.24 MB）。
- **解碼效能**：純二進位延遲解碼顯著優化單次區塊巡檢效能（較全程 JS 字串拼接解碼提升約 2.62 倍）。

#### 2.1.2 區塊化 (Block-Based) 與 $O(1)$ 隨機存取解碼

傳統 Front Coding 的主要缺陷在於：若要解碼第 $N$ 條字串，必須從第 1 條字串開始依序遞迴解碼至第 $N$ 條，無法進行任意目標的隨機存取。

為了兼顧高壓縮率與高效隨機讀取，本系統實作了 **Block-Based 區塊化設計**（以 $K$ 條字串劃分為一個獨立區塊 Block）：
- **區塊獨立性**：每個 Block 的第一條字串（`offsetInBlock = 0`）固定為 **Anchor String (錨點字串)**，`shared` 長度強制重置為 `0` 且不依賴前一區塊，使各個 Block 具備完全獨立解碼的能力。
- **定長區塊索引表 (Block Index Table)**：在二進位標頭後維護連續的 8 位元組定長索引項（`relTextOffset: uint32`, `blockLen: uint16`, `reserved: uint16`）。
- **隨機定點解碼流程**：當查詢引擎需要取得特定 ID (`targetId`) 的字串時，可透過純位元運算瞬間定位：
  $$\text{blockIdx} = \lfloor \text{targetId} / K \rfloor, \quad \text{offsetInBlock} = \text{targetId} \pmod{K}$$
  引擎只需自索引表讀取該 `blockIdx` 的 `relTextOffset`，即可直接對該區塊內的 1~$K$ 條字串進行單一區塊 UTF-8 解碼，免除無關區塊的 I/O 與解碼負擔。

#### 2.1.3 區塊大小超參數敏感度分析與極限數據 (Hyperparameter Sensitivity Analysis & Trade-offs)

在 Block-Based 架構中，區塊大小 $K$（Block Size）是影響「二進位資產體積」與「隨機解碼延遲」的核心控制超參數：
- **$K$ 越小**：區塊數越多，錨點字串 (Anchor String) 與區塊索引表項目呈線性增加，導致**資料壓縮率下降（檔案體積變大）**，但單次解碼需巡檢的字串較少。
- **$K$ 越大**：Front Coding 重疊鏈拉長，壓縮率提升（檔案體積變小），但單次隨機解碼時需在位元組 Buffer 中巡檢更多無關前綴，導致 **CPU 解碼延遲上升**。

**實驗方法與工作負載說明 (Methodology & Workload Sampling)**：
1. **消除 V8 JIT 編譯偏誤**：所有微基準測試（Micro-benchmarks）於正式量測前均執行 **V8 JIT 預熱 (Warm-up Runs)**，確保執行階段已完成 Inline Caching 與 JIT 編譯。
2. **工作負載抽樣 (Workload Sampling)**：採全台 44,658 條前綴 ID 之**均勻隨機抽樣 (Uniform Random Sampling)**，用以模擬高熵 (High-Entropy) 與 CPU L1/L2 Cache 錯失 (Cache Miss) 最嚴苛之邊界情境。
3. **廣域超參數涵蓋**：涵蓋 $K \in \{16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 44658\}$ 共 12 組區塊大小，包含最極限的 $K = 44,658$（全台僅 1 個單一大區塊 Single Block），每組均執行 10 次獨立採樣取平均值與標準差 ($\mu \pm \sigma$)。

這 12 組實驗數據完整勾勒出系統在「空間體積」與「時間延遲」上的 Pareto 邊界（Pareto Frontier）：

| 區塊大小 ($K$) | 區塊總數 | Front Coded 文字流 | 區塊索引表 | 前綴結構體積 (不含倒排索引)* | 單次區塊隨機解碼延遲 ($\mu \pm \sigma$)** | 空間與時間邊際效益分析 |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **16** | 2,792 | 439.78 KB | 21.81 KB | **461.60 KB** | **3.31 ± 1.07 µs** | 區塊與索引表數量龐大，體積開銷顯著 (+15.4%) |
| **32** | 1,396 | 409.62 KB | 10.91 KB | **420.53 KB** | **4.07 ± 0.80 µs** | 解碼極快，但傳輸體積略高 (+5.1%) |
| **64** | **698** | **394.60 KB** | **5.45 KB** | **400.05 KB** | **7.48 ± 0.52 µs** | ✨ **預設折衷解：兼顧小於 400 KB 體積與微秒級解碼** |
| **128** | 349 | 387.11 KB | 2.73 KB | **389.84 KB** | **10.74 ± 0.64 µs** | 體積縮減 10.21 KB (-2.55%)，延遲微幅增加 3.26 µs |
| **256** | 175 | 383.34 KB | 1.37 KB | **384.71 KB** | **19.71 ± 1.04 µs** | 體積縮減 15.34 KB (-3.83%)，延遲保持在 20 µs 內 |
| **512** | 88 | 381.50 KB | 0.69 KB | **382.19 KB** | **35.50 ± 0.76 µs** | 體積到達高原期 (-4.46%)，延遲呈 $O(K)$ 線性上升 |
| **1,024** | 44 | 380.59 KB | 0.34 KB | **380.93 KB** | **67.41 ± 2.81 µs** | 空間收益趨近於 0 (-0.33% vs 512)，延遲翻倍 |
| **2,048** | 22 | 380.09 KB | 0.17 KB | **380.26 KB** | **130.85 ± 4.60 µs** | 單次解碼延遲突破 100 µs 門檻 |
| **4,096** | 11 | 379.86 KB | 0.09 KB | **379.95 KB** | **266.81 ± 11.11 µs** | 解碼開銷顯著增長，體積完全停滯 |
| **8,192** | 6 | 379.76 KB | 0.05 KB | **379.81 KB** | **500.35 ± 17.78 µs** | 單次解碼達 0.5 ms |
| **16,384** | 3 | 379.69 KB | 0.02 KB | **379.72 KB** | **1,046.74 ± 51.38 µs** | 單次解碼突破 1.0 ms |
| **44,658** | **1** | **379.65 KB** | **0.01 KB** | **379.65 KB** | **2,840.59 ± 98.84 µs** | 💥 **極限單一區塊**：體積僅省 20.4 KB (-5.1%)，延遲飆升至 **2.84 ms** |

> `*註1：此處體積僅計算 Front Coded 文字流與區塊索引表；若加入 2.2 節之二進位倒排索引（Char Map Table 與 Posting Stream），實體檔案 address_prefixes.bin 總體積為 1.24 MB。`  
> `**註2：單次區塊解碼延遲為微基準測試 (Micro-benchmark)；3.4 節之 71.73 µs 則為包含了倒排索引交集、區塊解碼與規則比對的端到端完整查詢延遲 (End-to-End Latency)。`

**核心實測發現與理論限制**：

1. **壓縮率漸進物理極限 (Asymptotic Compression Limit ~379.6 KB)**：
   - 數據證實，當區塊大小擴大至理論極限（$K = 44,658$，即全台無任何 Anchor 重置的單一區塊 Single Block）時，前綴結構體積收斂至 **379.65 KB**。
   - 與預設 $K = 64$ (400.05 KB) 相比，即使付出了失去任意隨機存取能力的極端代價，體積僅能額外縮減 **20.4 KB (-5.1%)**。這說明 Front Coding 在全台門牌前綴上的重疊率壓縮效益在 $K \ge 64$ 時已進入嚴重的對數平坦期。

2. **時間複雜度的懲罰 ($O(K)$ 隨機掃瞄)**：
   - 隨機解碼單一 ID 時，必須自該區塊 Anchor 開始順序解碼至 `offsetInBlock`。在單一區塊 ($K = 44,658$) 下，平均隨機解碼需要歷經 22,329 個字串節點的鏈式解算，導致單次解碼延遲暴增至 **2,840.59 µs (2.84 ms)**（較 $K=64$ 慢 380 倍）。
   - 若單次地址檢索觸發 3 條候選 ID 解碼，單區塊架構將在瀏覽器主執行緒產生 **> 8.5 ms** 的阻塞，徹底破壞前端 UI 順暢度與 Serverless 冷啟動優勢。

3. **劣勢區間與 Dominance 判定**：
   - 當 $K > 512$ 時，空間體積縮減率每翻倍 $K$ 均小於 0.5%，但解碼時間卻呈 $O(K)$ 嚴格線性上升。因此 $K > 512$ 在 Pareto 雙目標優化曲線上屬於被嚴格劣化的無效選擇 (Strictly Dominated)。

**專案優化目標 (Optimization Goals) 與超參數選型導航矩陣**：

本專案不盲目宣稱單一 $K$ 值為絕對唯一最佳解，而是根據不同的部署情境與工程目標提供客觀選型建議：

| 專案優化目標導向 | 建議超參數 | 前綴結構體積 | 解碼延遲 | 適用部署情境與設計理由 |
| :--- | :---: | :---: | :---: | :--- |
| **極致傳輸體積優先 (Minimal Payload)** | **$K = 256$ 或 $512$** | **384.71 ~ 382.19 KB** | **19.71 ~ 35.50 µs** | **適用於對 Bundle Size 極度敏感之邊緣環境**（如 embedded SDK 或網路頻寬極受限場景）。僅需付出一微秒級（< 36 µs）的極小延遲代價，即可將體積壓至接近物理極限 (379.6 KB)。 |
| **極致低延遲 / 高併發優先 (High Throughput)** | **$K = 32$** | **420.53 KB** | **4.07 µs** | **適用於 Cloudflare Workers / Serverless 門戶服務**。提供極速 4 µs 隨機解碼能力，極致化系統吞吐量。 |
| **通用平衡預設值 (Balanced Default)** | **$K = 64$** | **400.05 KB** | **7.48 µs** | **ZipCodeTw 預設配置**。成功將資產控制在 400 KB 關卡內，並維持單次解碼 $< 10\ \mu\text{s}$，提供空間與時間的綜合評估最佳點 (Knee Point)。 |

---

## 2.2 預建二進位倒排索引與零物件配置檢索引擎

即使字串經過 Front Coding 壓縮，若在查詢時需要對 44,658 條門牌前綴進行全表比對 ($O(N)$)，單次查詢仍會消耗數毫秒，且需頻繁解碼非目標字串。

ZipCodeTw 於編譯時期為全台門牌前綴中出現過的 **1,807 個 Unicode 字元** 事先建置了二進位倒排索引（Inverted Index），配合 TypedArray 指標運算達成極速比對。

#### 2.2.1 倒排索引資料結構

`address_prefixes.bin` 包含以下二進位倒排索引結構：

1. **字元對照表 (Char Map Table)**：
   包含 1,807 個字元的定長 10 位元組結構陣列（已依 Unicode `charCode` 升冪排序）：
   - `charCode` (`uint16`)：Unicode 字元編碼
   - `postingOffset` (`uint32`)：該字元倒排清單在 Posting Stream 中的位元組偏移量
   - `postingLen` (`uint32`)：包含該字元的前綴字串總數量
   - 支援二分搜尋 ($O(\log C)$)，可瞬間獲得任何字元對應的二進位倒排清單。

2. **倒排清單串流 (Posting Stream)**：
   連續儲存每位字元出現過的所有前綴字串 ID（`Uint16Array` 16-bit 無符號整數串流）。

> [!NOTE]
> **邊界條件與擴充性考量 (Scalability & Boundary Constraints)**：
> 現行系統採用 `Uint16Array`（容量上限 65,535）儲存前綴 ID，可完整涵蓋全台現有 44,658 條前綴（佔用上限 68.1%）。若未來全台門牌前綴數量突破 65,536 條，二進位標頭已預留版本欄位，系統架構支援無縫升級切換為 Varint 或 `Uint32Array` 儲存編碼。

#### 2.2.2 雙指標 $O(N+M)$ 交集與零展開 (Zero-Expansion) 搜尋算法

當使用者輸入查詢地址（例如："臺北市大安區和平東路"）時，[BinaryPrefixSearchEngine](packages/zipcodetw/src/core/BinaryPrefixSearchEngine.ts) 的檢索流程如下：

```
[ 查詢字串 "大安和平" ]
        │
        ▼ (取得各字元 Uint16Array 倒排清單)
  L_大: [102, 105, 308, ...] (Len: 1,200)
  L_安: [102, 308, 412, ...] (Len: 850)
  L_和: [102, 510, ...]      (Len: 320)
  L_平: [102, 510, ...]      (Len: 180)
        │
        ▼ (依清單長度由短至長排序過濾)
  Sorted Lists: [L_平, L_和, L_安, L_大]
        │
        ▼ (TypedArray 雙指標 O(N+M) 位元交集)
  Candidate String IDs = [102]  (瞬間縮減至 1~3 條候選 ID)
        │
        ▼ (惰性解碼 Block-Based Front Coding)
  僅針對 ID 102 實施區塊 UTF-8 解碼，其餘 99.99% 字串保持 Uint8Array 狀態
```

1. **倒排清單檢索**：讀取查詢字元對應之二進位 `Uint16Array` 指標清單 $L_1, L_2, \dots, L_k$。
2. **長度排序優先過濾**：將清單按元素數量由短至長排序，率先以最少元素的清單縮小交集範圍。
3. **雙指標零配置交集演算法 (Two-Pointer Intersection)**：
   實作 [intersectSortedUint16](packages/zipcodetw/src/core/BinaryPrefixSearchEngine.ts) 方法，利用 TypedArray 指標在靜態記憶體 Buffer 上進行雙指標線性交集：
   $$\text{Candidates} = L_1 \cap L_2 \cap \dots \cap L_k$$
   過程不建立任何 JS `Set` 或 `Map` 物件，交集時間複雜度為 $O(\sum |L_i|)$，可在微秒級時間內將 44,658 條前綴字串瞬間過濾至僅 **1 ~ 3 條候選 ID**。
4. **惰性解碼驗證 (Zero-Expansion)**：
   最終僅對過濾出的 1~3 條候選 ID 呼叫 [decodeStringById()](packages/zipcodetw/src/core/BinaryPrefixSearchEngine.ts) 進行單一區塊 UTF-8 解碼與子序列驗證。其餘 99.99% 的前綴字串於整個查詢生命週期中完全保持原生 `Uint8Array` 二進位狀態，達成 **V8 堆記憶體 0 MB 展開與零垃圾回收 (GC) 停頓**。

---

### 2.3 門牌規則二進制與零複製比對 (`zipcode_rules.bin`)

79,876 筆門牌規則編譯為 1.33 MB 二進位檔，較原始 JSON 結構 6.11 MB 減少 77.5%：

- **32 位元組標頭 (`ZPR1`)**：定義郵遞區號字典、大宗戶名稱池與規則索引表偏移。
- **10 位元組定長索引表**：每筆規則固定佔用 10 位元組（`part1Index: uint16`, `zipcodeId: uint16`, `bulkNameId: uint16`, `ruleStreamOffset: uint32`），可經由 $O(1)$ 指標移位讀取。
- **2 位元組控制標頭**：
  - `標頭位元組 1`：使用位元遮罩標示數值、最小值、最大值、奇偶性 (`parity`: 0=無, 1=單, 2=雙, 3=連) 與子號模式 (`subMode`: 0=無, 1=all, 2=sub_all)。
  - `標頭位元組 2`：以 4-bit Enum 編碼門牌單位 (`unit`: 1=號, 2=巷, 3=樓, 4=弄, 5=附號) 與結束單位。
- **零複製位元比對**：`BinaryRuleStore` 接收查詢門牌數值，直接於 Buffer 偏移位進行位元遮罩運算，比對過程零物件配置（Zero Allocations）。

### 2.4 純 TypeScript 端到端資料管線

淘汰 Python 腳本與硬碟中間檔落檔過程：
- 實作 [fetch_official_dbf.ts](packages/zipcodetw/scripts/crawler/fetch_official_dbf.ts)，使用 Node/Bun 原生 `TextDecoder('big5')` 於記憶體中解析中華郵政 `rall1.dbf`。
- 直接在記憶體中串流輸出二進位資產，避免中間檔的硬碟 I/O，建置速度提升 30%。

---

## 3. 解決方案綜合對比矩陣與實驗效能報告

### 3.1 解決方案綜合對比矩陣 (Comprehensive Solution Matrix)

下表將 **ZipCodeTw 全二進制零展開引擎** 與業界傳統的一般解決方案進行多維度綜合評估：

| 評估維度 | 伺服器端 DB (RDBMS) | 在線 REST API | 記憶體 JSON 展開法 | ZipCodeTw 全二進制 |
| :--- | :---: | :---: | :---: | :---: |
| **運作環境相容性** | 僅 Server | 需網路連線 | Server / Browser | **Server / Edge / Browser (全平台)** |
| **網路傳輸體積** | 0 KB (DB獨立) | 0 KB (API呼叫) | 6.1 MB ~ 12.2 MB | **791 KB (Brotli)** |
| **啟動耗時 (Load Time)**| N/A | N/A | ~246 ms | **~12 ms (-95.1%)** |
| **V8 Heap 額外淨增長** | ~0 MB | ~0 MB | ~35.7 MB | **0.00 MB (-100%)** |
| **進程總記憶體 (RSS)** | N/A | N/A | ~164.8 MB | **< 9.3 MB (-94.4%)** |
| **端到端單次查詢延遲** | 50~200 ms (網路RTT)| 100~500 ms (API RTT)| **0.0666 ms (66.64 微秒)** | **0.0717 ms (71.73 微秒)** (+5.09 µs) |
| **離線 / 零依賴運作** | ❌ (需 DB) | ❌ (需網路 API) | 視數據載入而定 | **✅ 100% 離線零依賴** |

### 3.2 儲存體積與網路傳輸壓縮率

測試環境：Windows 11 x64, Bun v1.3.5 / Node.js 執行階段，針對 79,876 筆門牌對照資料實測。

| 資產層級 | 檔案類型 / 傳輸協定 | 檔案體積 | 說明與縮減率 |
| :--- | :--- | :---: | :--- |
| **官方 DBF 資料庫** | `rall1.dbf`（原始檔） | 12.20 MB | 官方來源對照檔 |
| **二進位前綴檔 (Part 1)** | `address_prefixes.bin` | 1.24 MB | 含 1,807 字元預建倒排索引 (Byte Count 方案) |
| **二進位規則檔 (Part 2)** | `zipcode_rules.bin` | 1.33 MB | 較傳統 JSON 結構減少 77.5% |
| **二進位資產總體積** | **Disk Asset Total** | **2.57 MB** | 較官方原始檔壓縮 **-78.9%** |
| **HTTP 傳輸體積 (Gzip)** | Gzip 傳輸總量 | 1.43 MB | 較二進位資產再減少 -44.5% |
| **HTTP 傳輸體積 (Brotli)**| Brotli 傳輸總量 | **791.96 KB** (0.77 MB) | 較二進位資產再減少 **-69.3%** |

### 3.3 冷啟動耗時與記憶體佔用

經由 [measure_memory.ts](packages/zipcodetw/scripts/measure_memory.ts) 進行進程記憶體快照比對：

| 效能與資源指標 | 傳統 JSON 展開法 | ZipCodeTw 全二進制零展開引擎 | 改善幅度 |
| :--- | :---: | :---: | :---: |
| **引擎載入耗時 (Load Time)** | 246.45 ms | **12.11 ms** | **-95.10%** |
| **V8 Heap 堆記憶體淨增長** | 35.74 MB | **0.00 MB** | **-100.00%** |
| **進程總記憶體淨增長 (RSS Delta)** | 164.86 MB | **9.27 MB** | **-94.38%** |

### 3.4 查詢效能與工程 Trade-off 分析

在 10,000 次隨機實際門牌查詢測試結果如下：

| 查詢效能指標 | 傳統 JSON 展開法 | ZipCodeTw 全二進制零展開引擎 | 差異與 Trade-off |
| :--- | :---: | :---: | :--- |
| **10,000 次查詢總耗時** | 666.43 ms | 717.27 ms | +50.84 ms (+7.6%) |
| **端到端單次查詢平均延遲** | **0.0666 ms** (66.64 微秒) | **0.0717 ms** (71.73 微秒) | 慢 **5.09 微秒** (+7.6%) |
| **每秒查詢吞吐量 (QPS)**| ~15,000 QPS | ~13,900 QPS | 均滿足萬級高併發需求 |

#### 3.4.1 熱查詢 (Hot Query) 延遲差異之底層主因

實驗數據顯示，傳統 JSON 展開法在單次熱查詢平均延遲上微幅領先 **5.09 微秒**（66.64 µs vs 71.73 µs）。此項微幅差異源於 V8 執行階段底層對不同資料結構的優化機制：

1. **V8 原生 C++ Hash Map 優化**：
   傳統 JSON 展開法在冷啟動階段即將 79,876 筆門牌資料完整解碼，建置為巨大的原生 JavaScript 物件與 Hash Map。V8 引擎針對內建物件的屬性訪問與 Hash Key 比對進行了高度編譯優化（包含 Inline Caching 與底層 C++ 查找），因此在資料已全量展開至記憶體前提下，能達成極快的雜湊讀取速度。

2. **二進位位元串流之計算開銷**：
   ZipCodeTw 為了追求「零展開 (Zero-Expansion)」與「極小記憶體佔用」，未在啟動時預先建置 Hash Map。查詢時引擎需對靜態二進位 Buffer 執行 TypedArray 二分搜尋、倒排清單指標交集以及 Block-Based 區塊惰性解碼。這些動態位元運算與指標計算產生了約 **5.09 微秒 (+7.6%)** 的 CPU 計算時間。

#### 3.4.2 空間/時間與冷啟動之綜合工程權衡 (Space-Time Trade-off)

從學術與工程角度分析，ZipCodeTw 選擇了經典的**時間與空間權衡 (Space-Time Trade-off)**。系統付出微乎其微的 5.09 微秒（約 1/200 毫秒，遠在使用者感知極限以下）CPU 運算開銷，換取了顯著的資源省量與運作彈性：

- **堆記憶體極致省量**：V8 堆記憶體淨增長降低 **-100%**（0 MB 堆記憶體展開 vs 35.74 MB）。
- **系統進程記憶體省量**：總進程記憶體佔用降低 **-94.38%**（< 9.3 MB RSS vs 164.86 MB）。
- **極速冷啟動響應**：引擎載入與預處理耗時降低 **-95.10%**（12.11 ms vs 246.45 ms）。
- **網路傳輸優化**：全台門牌資料傳輸體積縮減 **-78.9%**（791.96 KB Brotli vs 12.2 MB）。

綜合評估表明，在資源受限的無伺服器邊緣運算節點（Cloudflare Workers, AWS Lambda@Edge）以及行動端瀏覽器離線查詢等場景中，此項 Trade-off 展現了明確的綜合工程價值。

---

## 4. 結論

本專案系統性地分析並解決了傳統一般解決方案（SQL 資料庫、線上 REST API 與記憶體 JSON 展開法）在台灣 3+3 郵遞區號解析上的缺陷：
1. **擺脫基礎設施與網路依賴**：實現 100% 前端瀏覽器、Edge (Cloudflare Workers / Lambda Edge) 及離線環境相容。
2. **極致壓縮與零展開**：透過 Block-Based Front Coding、預建倒排索引與 Bitmask 定長規則檔，將全台門牌網路傳輸體積壓縮至 **791.96 KB (Brotli)**。
3. **客觀嚴謹的工程權衡 (Trade-off)**：雖然二進位檢索引擎因動態指標運算與區塊解碼，在單次熱查詢延遲上較傳統 fully-expanded JSON 哈希表微幅增加 **5.09 微秒 (+7.6%)**，但卻換取了 **12ms 極速冷啟動**、**0 MB V8 堆記憶體淨增長**與 **-94.4% 的系統記憶體佔用**，在微服務冷啟動與邊緣運算場景展現壓倒性優勢。

全套程式碼與資料管線已通過單元測試與 Biome 程式碼規範檢查。

---

## 相關文檔

- [README.md](README.md) - 專案門面與快速上手指南
- [ARCHITECTURE.md](ARCHITECTURE.md) - 核心系統架構與設計哲學
- [docs/SHOWCASE.md](docs/SHOWCASE.md) - 30 秒評審與技術亮點報告
- [docs/api.md](docs/api.md) - 完整 API 參考手冊


