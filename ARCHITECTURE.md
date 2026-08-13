# ZipCodeTw 系統架構與設計哲學 (ARCHITECTURE.md)

本文檔詳細說明 **ZipCodeTw** 台灣 3+3 郵遞區號解析引擎的二進位記憶體佈局、演算邏輯、語法分析器設計與系統效能 Trade-off。

---

## 1. 架構設計哲學：全二進制零展開 (Dual Binary Zero-Expansion)

傳統 JavaScript/TypeScript 套件在處理大容量對照表時，習慣將數據存為 JSON 或 JavaScript 物件。在啟動時，V8 引擎必須透過 `JSON.parse()` 將完整資料庫展開為實體物件與 Hash Map 樹狀結構。

對於全台灣 **79,876 筆** 門牌對照資料而言，JSON 展開法會產生逾 44,000 個字串物件與 79,000 個規則物件，導致以下嚴重問題：
1. **冷啟動延遲昂貴**：`JSON.parse()` 與 Hash 樹建置需耗時 > 240 ms，無法滿足 Cloudflare Workers / Serverless 零冷啟動 (Zero-Cold-Start) 需求。
2. **記憶體與 GC 負擔沉重**：V8 堆記憶體淨增長 35.7 MB，系統進程 RSS 記憶體高達 164.8 MB，且在記憶體受限環境下易引發頻繁的垃圾回收 (GC) 停頓。

ZipCodeTw 採用 **全二進制零展開 (Dual Binary Zero-Expansion)** 設計哲學：將全量門牌與投遞規則於編譯期直接壓裝為兩份自訂二進位資產（`address_prefixes.bin` 與 `zipcode_rules.bin`）。在執行期，檢索引擎**完全不解碼或展開未被查詢到的資料**，直接在原生 `Uint8Array` 記憶體 Buffer 上進行位元運算與指標交集。

---

## 2. 系統架構與編譯流水線

```
                              [ 中華郵政 rall1.dbf (12.2 MB) ]
                                             │
                                             ▼ (packages/zipcodetw/scripts/crawler/fetch_official_dbf.ts)
                                  [ 純記憶體 Big5 DBF Reader ]
                                             │
                                             ▼
                                  [ RawAddress[] (79,876 筆) ]
                                             │
                                             ▼ (Chevrotain AST 門牌條件解析器)
                                 [ Parsed AddressRules ]
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼ (二進制編譯器)                             ▼ (二進制編譯器)
       ┌───────────────────────────────┐           ┌───────────────────────────────┐
       │     address_prefixes.bin      │           │       zipcode_rules.bin       │
       │           (1.24 MB)           │           │           (1.33 MB)           │
       ├───────────────────────────────┤           ├───────────────────────────────┤
       │ 1. 標頭 Header (16 bytes)      │           │ 1. 標頭 ZPR1 Header (32 bytes)│
       │ 2. 區塊索引表 (Block Index)   │           │ 2. 郵遞區號與大宗戶字典串流   │
       │ 3. Front-Coded 位元組串流     │           │ 3. 10-byte 定長規則索引表     │
       │ 4. 倒排字元表 (Char Map)      │           │ 4. Bitmask 規則控制串流       │
       │ 5. 倒排 ID 串流 (Posting Stream)│         └───────────────────────────────┘
       └───────────────┬───────────────┘                           │
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             ▼
                              [ ZipCodeTw / AddressQueryService ]
                                             │
               ┌─────────────────────────────┴─────────────────────────────┐
               ▼ (1. 倒排指標與 TypedArray 位元交集)                        ▼ (2. 位元遮罩零複製比對)
   [ BinaryPrefixSearchEngine ]                                   [ BinaryRuleStore ]
   (候選門牌 ID 縮減至 1~3 條)                                    (驗證單雙號、範圍與樓層)
               │                                                           │
               └─────────────────────────────┬─────────────────────────────┘
                                             ▼
                              [ SearchMatch[] 最終查詢結果 ]
```

---

## 3. 二進位記憶體佈局 (Binary Assets Memory Layout)

### 3.1 門牌前綴資產 (`address_prefixes.bin`)

全檔體積 1.24 MB，包含全台 44,658 條門牌前綴與預建倒排索引：

#### A. 檔案標頭與定長區塊索引表 (Block Index Table)
- **Header (16 位元組)**：包含魔術數字、版本號、門牌前綴總數 $N = 44,658$、區塊大小 $K = 64$ 及各區域位元組偏移量。
- **Block Index Table**：每區塊固定佔用 8 位元組（`relTextOffset: uint32`, `blockLen: uint16`, `reserved: uint16`）。

#### B. Block-Based Front Coding 字串串流
每個 Block 包含 $K = 64$ 條依 Unicode 排序的門牌字串：
- **首條錨點字串 (Anchor String, offsetInBlock = 0)**：儲存 2 位元組 `uint16` 全量 UTF-8 位元組長度 `anchorLen`，後隨原始 UTF-8 位元組串流。
- **後續增量字串 (offsetInBlock = 1..63)**：
  - `shared` (`uint8`, 1 byte)：與同區塊前一條字串相同的 UTF-8 位元組長度。
  - `remLen` (`uint8`, 1 byte)：剩餘差異尾綴之 UTF-8 位元組長度。
  - `remStr` (`Uint8Array`, `remLen` bytes): 剩餘差異 UTF-8 位元組串流。

#### C. 二進位倒排索引 (Inverted Index)
- **字元對照表 (Char Map Table)**：包含全台門牌出現過的 1,807 個 Unicode 字元。每項固定 10 位元組（`charCode: uint16`, `postingOffset: uint32`, `postingLen: uint32`），依 `charCode` 排序以支援 $O(\log C)$ 二分搜尋。
- **倒排清單串流 (Posting Stream)**：連續儲存各字元出現過的門牌前綴 ID 陣列（`Uint16Array` 串流）。

---

### 3.2 門牌規則資產 (`zipcode_rules.bin`)

全檔體積 1.33 MB，包含 79,876 筆複雜投遞規則：

#### A. 標頭 (ZPR1 Header, 32 位元組)
包含資產標識符 `ZPR1`、規則總數 (79,876 筆)、Part 1 前綴對照數及 ZipCode/BulkName 字典偏移量。

#### B. 10 位元組定長規則索引表 (Fixed-size Index Table)
每筆門牌規則固定佔用 10 位元組，允許 $O(1)$ 指標移位讀取：
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ part1Index (u16)│  zipcodeId (u16)│ bulkNameId (u16)│ruleStreamOffset │
│    (2 bytes)    │    (2 bytes)    │    (2 bytes)    │    (uint32)     │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

#### C. Bitmask 控制標頭與規則串流
以精簡位元遮罩標記門牌條件：
- **標頭位元組 1 (Bitmask Header)**：
  - `bit 0`: 是否有單點數值 (`hasValue`)
  - `bit 1`: 是否有範圍最小值 (`hasMin`)
  - `bit 2`: 是否有範圍最大值 (`hasMax`)
  - `bits 3-4`: 單雙號限制 (`parity`: 0=無, 1=單, 2=雙, 3=連)
  - `bits 5-6`: 子號模式 (`subMode`: 0=無, 1=all, 2=sub_all)
- **標頭位元組 2 (Unit Enum Header)**：
  - `bits 0-3`: 門牌單位 Enum (1=號, 2=巷, 3=樓, 4=弄, 5=附號)
  - `bits 4-7`: 結束單位 Enum (如巷至號)

---

## 4. 檢索引擎演算法與時間/空間複雜度

### 4.1 雙指標位元交集與惰性解碼演算法 ($O(N+M)$)

當查詢「`臺北市大安區和平東路`」時，檢索引擎執行以下步驟：

1. **倒排清單二分查找**：對查詢字串中各 Unicode 字元於 Char Map Table 進行 $O(\log C)$ 二分搜尋，提取對應的 `Uint16Array` 倒排 ID 清單 $L_1, L_2, \dots, L_k$。
2. **清單長度排序過濾**：將倒排清單依長度由短至長排序，優先以短清單進行位元過濾。
3. **TypedArray 雙指標交集 (`intersectSortedUint16`)**：
   在原生 Uint16 記憶體 Buffer 上實施雙指標線性掃描：
   $$\text{Candidates} = L_1 \cap L_2 \cap \dots \cap L_k$$
   過程零 JS 物件配置，耗時僅數微秒，將 44,658 條前綴瞬間鎖定至 **1~3 條候選 ID**。
4. **$O(1)$ 區塊定位與惰性 UTF-8 解碼**：
   計算目標 ID 之區塊索引：
   $$\text{blockIdx} = \lfloor \text{targetId} / K \rfloor, \quad \text{offsetInBlock} = \text{targetId} \pmod{K}$$
   僅讀取該 Block 內的 Uint8Array 並單點呼叫 `TextDecoder`。其餘 99.99% 前綴字串全程保持 Uint8Array 狀態，達成 **V8 堆記憶體 0 MB 展開**。

---

## 5. 門牌條件 AST 語法分析器設計 (Chevrotain Parser)

中華郵政官方 DBF 中的門牌條件包含非結構化的中文描述（例如 `"雙全"`, `"單 101號以上"`, `"連 1之23號至 45號附號全"`, `"2樓以上"`）。

ZipCodeTw 在編譯期使用 [Chevrotain](https://github.com/SAP/chevrotain) 構建了完整的語法分析器 ([packages/zipcodetw/src/scripts/utils/addressRuleParser.ts](packages/zipcodetw/src/scripts/utils/addressRuleParser.ts))：
- **Lexer Tokenizer**：定義門牌數值、單位 (巷/弄/號/樓)、連接詞 (至/含/以上/以下) 與單雙號 token。
- **Parser BNF Grammar**：將複雜條件解析為 AST 結構樹。
- **Bitmask Encoder**：將 AST 壓縮並寫入 `zipcode_rules.bin` 的定長與變長位元組串流中。

---

## 6. 系統效能與工程 Trade-off

| 評估維度 | 傳統 JSON/JS 物件展開法 | ZipCodeTw 全二進制零展開引擎 | 工程權衡 (Trade-off) 分析 |
| :--- | :---: | :---: | :--- |
| **冷啟動時間** | 246.45 ms | **12.11 ms** | **-95.10%**（極速零冷啟動） |
| **V8 Heap 堆記憶體** | 35.74 MB | **0.00 MB** | **-100.00%**（零物件展開） |
| **系統進程 RSS** | 164.86 MB | **< 9.27 MB** | **-94.38%**（適合 Edge 與微型容器） |
| **熱查詢單次延遲** | **0.0666 ms** (66.6 µs) | **0.0717 ms** (71.7 µs) | +5.09 µs（動態位元運算產生的微幅代價） |

**工程決策**：ZipCodeTw 選擇以極微幅的 **5.09 微秒 (+7.6%)** CPU 計算時間（遠低於人類感知極限 1 毫秒），換取了 **-95% 的冷啟動縮減** 與 **-94% 的記憶體佔用降低**，完美適應 Serverless / Cloudflare Workers 與瀏覽器前端等資源敏感型環境。

---

## 相關文檔

- [README.md](README.md) - 專案門面與快速上手指南
- [docs/api.md](docs/api.md) - 完整 API 參考手冊
- [docs/SHOWCASE.md](docs/SHOWCASE.md) - 30 秒評審與技術亮點報告
- [RESEARCH_REPORT.md](RESEARCH_REPORT.md) - 學術研究報告與超參數敏感度測試
