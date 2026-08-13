# ZipCodeTw 專案技術亮點與展示報告

## 摘要

**ZipCodeTw** 是一個兼具極速冷啟動與低記憶體開銷的 **台灣 3+3 郵遞區號與模糊門牌解析引擎**。

專案徹底淘汰傳統將 79,876 筆資料庫展開為巨大 JSON/JS 物件的昂貴解法，創新地設計了 **全二進制零展開** 檢索架構。將全台 12.2 MB 的官方 DBF 資料庫編譯為僅 **791 KB (Brotli)** 的兩份二進位索引資產（`address_prefixes.bin` 與 `zipcode_rules.bin`），實現前端瀏覽器、無伺服器邊緣運算 (Cloudflare Workers) 與 Node.js 的全平臺 100% 離線極速檢索。

---

## 系統架構與資料流水線

```
[ 中華郵政 rall1.dbf (12.2 MB) ]
         │
         ▼ (純 TypeScript DBFReader + Chevrotain AST 語法分析器)
[ 記憶體門牌規則與投遞條件 ]
         │
         ▼ (二進位雙資產編譯器)
┌─────────────────────────────────────┬─────────────────────────────────────┐
│    address_prefixes.bin (1.24 MB)   │      zipcode_rules.bin (1.33 MB)    │
│  (區塊化 Front Coding + 預建倒排索引)│    (定長 Index Table + Bitmask 標頭) │
└─────────────────────────────────────┴─────────────────────────────────────┘
         │                                     │
         └──────────────────┬──────────────────┘
                            ▼
           [ BinaryPrefixSearchEngine ] (TypedArray 雙指標 O(N+M) 位元交集)
           [     BinaryRuleStore      ] (位元遮罩條件運算)
```

---

## 四大資工核心技術亮點

### 1. 演算法與資料結構

- **Block-Based Front Coding 區塊增量編碼**：將全台 44,658 條門牌前綴依 Unicode 字典序排序，利用連續前綴重疊性實施增量編碼。
- **$O(1)$ 定點隨機讀取定位**：針對傳統 Front Coding 無法隨機存取的缺陷，設計以 $K=64$ 為單位的獨立區塊標頭與定長索引表，查詢時僅需透過 $\lfloor \text{ID}/K \rfloor$ 計算即可單點解碼目標區塊。

### 2. 位元運算與記憶體優化

- **TypedArray 指標交集算法**：編譯期預建 1,807 個 Unicode 字元的 `Uint16Array` 倒排串流（Posting Stream），查詢時利用 `intersectSortedUint16` 進行雙指標線性交集，過程 **0 MB JS 物件展開**。
- **Zero-GC (零垃圾回收) 策略**：99.99% 的門牌前綴於整個查詢生命週期中完全保持原生二進位 `Uint8Array` 狀態，使 V8 Heap 堆記憶體淨增長為 **0.00 MB**，徹底消除 GC 停頓風險。

### 3. 編譯原理與語法解析

- **Chevrotain AST 門牌規則分析器**：中華郵政門牌規則包含「單雙號」、「地下樓層」、「含附號」、「起訖範圍」等複雜條件。專案透過 Chevrotain 建立 Lexer & Parser，將自然語言規則自動轉譯為極小化位元遮罩（Bitmask）結構與 10-byte 定長規則條目。

### 4. 系統效能與零冷啟動

- **12 ms 極速冷啟動**：較傳統 JSON 展開法（246 ms）提升 **95.1%** 的啟動響應速度，極致契合 Cloudflare Workers / Serverless 的零冷啟動需求。
- **-94% 記憶體佔用**：系統進程 RSS 記憶體由 164.8 MB 降至 **< 9.3 MB**。

---

## 業界既有解決方案 vs ZipCodeTw 量化數據對比

| 評估指標               | 伺服器端 DB (SQL/SQLite) | 在線 REST API (郵局 API) | 記憶體 JSON 展開法 |     ZipCodeTw 全二進制零展開引擎     |       ZipCodeTw 效益優勢       |
| :--------------------- | :----------------------: | :----------------------: | :----------------: | :----------------------------------: | :----------------------------: |
| **全平臺相容性**       |        僅 Server         |        需網路連線        |  Server / Browser  | **Server / Edge / Browser (全平臺)** |      **100% 離線零依賴**       |
| **HTTP 傳輸體積**      |           0 KB           |           0 KB           |  6.1 MB ~ 12.2 MB  |         **791 KB (Brotli)**          |   **較原始資產壓縮 -93.5%**    |
| **引擎啟動耗時**       |           N/A            |           N/A            |     246.45 ms      |             **12.11 ms**             |      **冷啟動快 -95.10%**      |
| **V8 Heap 淨增長**     |          ~0 MB           |          ~0 MB           |      35.74 MB      |             **0.00 MB**              | **堆記憶體 0 MB 展開 (-100%)** |
| **進程總記憶體 (RSS)** |           N/A            |           N/A            |     164.86 MB      |            **< 9.27 MB**             |   **系統記憶體減少 -94.38%**   |
| **端到端查詢延遲**     |   50~200 ms (網路RTT)    |   100~500 ms (API RTT)   |     0.0666 ms      |      **0.0717 ms (71.73 微秒)**      |      微秒級端到端極速查詢      |

---

## 延伸閱讀與資源

- **完整 API 使用手冊**：[`docs/api.md`](api.md)
- **核心系統架構與設計哲學**：[`ARCHITECTURE.md`](../ARCHITECTURE.md)
- **學術研究報告與超參數敏感度分析**：[`RESEARCH_REPORT.md`](../RESEARCH_REPORT.md)
- **線上 Demo 互動測試**：[https://wangicheng.github.io/zipcodetw/](https://wangicheng.github.io/zipcodetw/)
