import fs from 'node:fs';
import path from 'node:path';

import { DBFReaderTS, findLocalDBF, splitRoadAndSection } from '../scripts/crawler/fetch_official_dbf.ts';
import type { RawAddress } from '../src/core/types.ts';
import { createZipCodeTw } from '../src/node.ts';

interface LatencyStats {
  count: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  p99_9: number;
  qps: number;
}

function calculateStats(times: number[]): LatencyStats {
  times.sort((a, b) => a - b);
  const count = times.length;
  const sum = times.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const variance = times.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const getPercentile = (p: number) => {
    const idx = Math.min(count - 1, Math.floor((p / 100) * count));
    return times[idx];
  };

  const totalTimeSec = sum / 1_000_000;
  const qps = totalTimeSec > 0 ? count / totalTimeSec : 0;

  return {
    count,
    mean,
    stdDev,
    min: times[0],
    max: times[count - 1],
    p50: getPercentile(50),
    p75: getPercentile(75),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99),
    p99_9: getPercentile(99.9),
    qps,
  };
}

// 建立簡易 JSON 物件展開搜尋引擎作為對照組
class JsonExpandedEngine {
  private map: Map<string, Array<{ range: string; zipcode: string }>> = new Map();

  constructor(rawAddresses: RawAddress[]) {
    for (const item of rawAddresses) {
      const sec = item.section && item.section !== '0' ? item.section : '';
      const prefix = `${item.city}${item.district}${item.road}${sec}`;
      if (!this.map.has(prefix)) {
        this.map.set(prefix, []);
      }
      this.map.get(prefix)!.push({
        range: item.range,
        zipcode: item.zipcode,
      });
    }
  }

  search(address: string): Array<{ zipcode: string }> {
    for (const [prefix, rules] of this.map.entries()) {
      if (address.startsWith(prefix)) {
        return rules;
      }
    }
    return [];
  }
}

async function loadRawAddresses(): Promise<RawAddress[]> {
  const dbfPath = findLocalDBF();
  if (!dbfPath) {
    throw new Error('找不到 local DBF 檔案');
  }

  const fileBuf = fs.readFileSync(dbfPath);
  const reader = new DBFReaderTS();
  await reader.parseHeader(fileBuf);
  const records = reader.fetchRecords(fileBuf);

  return records.map((r) => {
    const [roadName, section] = splitRoadAndSection(r.ROAD || '');
    return {
      city: r.CITY || '',
      district: r.AREA || '',
      road: roadName,
      section,
      range: r.SCOOP || '',
      bulkName: r.DEPARTMENT || '',
      zipcode: r.ZIPCODE || '',
    };
  });
}

async function main() {
  console.log('================================================================');
  console.log(' ZipCodeTw 查詢延遲百分位數分佈與不同查詢場景實測');
  console.log('================================================================\n');

  const rawAddresses = await loadRawAddresses();
  console.log(`成功載入中華郵政官方門牌規則總數: ${rawAddresses.length.toLocaleString()} 筆`);

  // 初始化 ZipCodeTw 二進位引擎
  const zipCodeTw = await createZipCodeTw();
  // 初始化 JSON 展開對照組
  const jsonEngine = new JsonExpandedEngine(rawAddresses);

  // 構造 5 種不同查詢場景
  const exactQueries: string[] = [];
  const rangeQueries: string[] = [];
  const laneQueries: string[] = [];
  const floorQueries: string[] = [];
  const negativeQueries: string[] = [];
  const mixedQueries: string[] = [];

  // 生成負向查詢 (查無此路/不存在地址)
  const fakeCities = ['臺北市', '新北市', '臺中市', '高雄市', '臺南市'];
  const fakeRoads = ['不存在路一段', '虛擬科技大道', '幽靈巷', '未命名路', '想像街'];
  for (let i = 0; i < 2000; i++) {
    const c = fakeCities[i % fakeCities.length];
    const r = fakeRoads[i % fakeRoads.length];
    negativeQueries.push(`${c}中正區${r}${i + 1000}號`);
  }

  // 從真實資料庫採樣各類型門牌
  for (const item of rawAddresses) {
    const sec = item.section && item.section !== '0' ? item.section : '';
    const prefix = `${item.city}${item.district}${item.road}${sec}`;
    if (!prefix) continue;

    const range = item.range || '';

    if (range.includes('巷') || range.includes('弄') || range.includes('附號') || range.includes('之')) {
      if (laneQueries.length < 2000) {
        laneQueries.push(`${prefix}12巷3弄4之1號`);
      }
    } else if (range.includes('樓') || range.includes('地下')) {
      if (floorQueries.length < 2000) {
        floorQueries.push(`${prefix}10號2樓`);
      }
    } else if (range.includes('至') || range.includes('單') || range.includes('雙') || range.includes('以上')) {
      if (rangeQueries.length < 2000) {
        rangeQueries.push(`${prefix}28號`);
      }
    } else {
      if (exactQueries.length < 2000) {
        exactQueries.push(`${prefix}1號`);
      }
    }

    if (mixedQueries.length < 10000) {
      mixedQueries.push(`${prefix}${Math.floor(Math.random() * 200) + 1}號`);
    }
  }

  console.log(`生成測試集：`);
  console.log(`  - 1. 精確單點門牌 (Exact Match)     : ${exactQueries.length} 筆`);
  console.log(`  - 2. 單雙號區間門牌 (Range & Parity)  : ${rangeQueries.length} 筆`);
  console.log(`  - 3. 巷弄與附號門牌 (Lane / Sub-no)   : ${laneQueries.length} 筆`);
  console.log(`  - 4. 樓層條件門牌 (Floor / Basement)  : ${floorQueries.length} 筆`);
  console.log(`  - 5. 查無結果負向查詢 (Negative Lookup): ${negativeQueries.length} 筆`);
  console.log(`  - 6. 全台真實門牌混合 (Mixed 10,000)   : ${mixedQueries.length} 筆\n`);

  function benchmarkQueries(
    engine: { search: (q: string) => any },
    queries: string[],
    iterations: number,
  ): LatencyStats {
    // 1. V8 JIT 預熱
    for (let i = 0; i < 2000; i++) {
      engine.search(queries[i % queries.length]);
    }

    // 2. 正式量測
    const times: number[] = new Array(iterations);
    for (let i = 0; i < iterations; i++) {
      const q = queries[i % queries.length];
      const t0 = performance.now();
      engine.search(q);
      const t1 = performance.now();
      times[i] = (t1 - t0) * 1000; // 微秒 µs
    }

    return calculateStats(times);
  }

  const ITERATIONS = 10000;

  console.log('================================================================');
  console.log('【測試結果 1：全台 10,000 次混合門牌查詢之延遲百分位數分佈】');
  console.log('================================================================');

  const binMixedStats = benchmarkQueries(zipCodeTw, mixedQueries, ITERATIONS);
  const jsonMixedStats = benchmarkQueries(jsonEngine, mixedQueries, ITERATIONS);

  console.log(`\n指標維度 (單位: 微秒 µs) | ZipCodeTw 全二進制 | 傳統 JSON 展開法 | 差異與分析`);
  console.log(`:----------------------- | :----------------: | :---------------: | :-----------------------`);
  console.log(
    `平均延遲 (Mean µs)       | ${binMixedStats.mean.toFixed(2)} µs (${(binMixedStats.mean / 1000).toFixed(4)} ms) | ${jsonMixedStats.mean.toFixed(2)} µs (${(jsonMixedStats.mean / 1000).toFixed(4)} ms) | 差 ${(binMixedStats.mean - jsonMixedStats.mean).toFixed(2)} µs`,
  );
  console.log(
    `中位數 (P50 µs)          | ${binMixedStats.p50.toFixed(2)} µs | ${jsonMixedStats.p50.toFixed(2)} µs | 差 ${(binMixedStats.p50 - jsonMixedStats.p50).toFixed(2)} µs`,
  );
  console.log(
    `P75 (75th Percentile)    | ${binMixedStats.p75.toFixed(2)} µs | ${jsonMixedStats.p75.toFixed(2)} µs | 差 ${(binMixedStats.p75 - jsonMixedStats.p75).toFixed(2)} µs`,
  );
  console.log(
    `P90 (90th Percentile)    | ${binMixedStats.p90.toFixed(2)} µs | ${jsonMixedStats.p90.toFixed(2)} µs | 差 ${(binMixedStats.p90 - jsonMixedStats.p90).toFixed(2)} µs`,
  );
  console.log(
    `P95 (95th Percentile)    | ${binMixedStats.p95.toFixed(2)} µs | ${jsonMixedStats.p95.toFixed(2)} µs | 差 ${(binMixedStats.p95 - jsonMixedStats.p95).toFixed(2)} µs`,
  );
  console.log(
    `P99 (99th Percentile)    | ${binMixedStats.p99.toFixed(2)} µs | ${jsonMixedStats.p99.toFixed(2)} µs | 差 ${(binMixedStats.p99 - jsonMixedStats.p99).toFixed(2)} µs`,
  );
  console.log(
    `P99.9 (99.9th %)         | ${binMixedStats.p99_9.toFixed(2)} µs | ${jsonMixedStats.p99_9.toFixed(2)} µs | 差 ${(binMixedStats.p99_9 - jsonMixedStats.p99_9).toFixed(2)} µs`,
  );
  console.log(
    `標準差 (StdDev σ)        | ${binMixedStats.stdDev.toFixed(2)} µs | ${jsonMixedStats.stdDev.toFixed(2)} µs | 穩定性表現`,
  );
  console.log(
    `最小/最大值 (Min / Max)  | ${binMixedStats.min.toFixed(2)} / ${binMixedStats.max.toFixed(2)} µs | ${jsonMixedStats.min.toFixed(2)} / ${jsonMixedStats.max.toFixed(2)} µs | —`,
  );
  console.log(
    `每秒查詢吞吐量 (QPS)     | ~${Math.round(binMixedStats.qps).toLocaleString()} QPS | ~${Math.round(jsonMixedStats.qps).toLocaleString()} QPS | 均支援萬級高併發`,
  );

  console.log('\n================================================================');
  console.log('【測試結果 2：ZipCodeTw 在 5 種不同查詢場景下的延遲表現】');
  console.log('================================================================\n');

  const scenarios = [
    { name: '1. 精確單點門牌 (Exact Match)', data: exactQueries },
    { name: '2. 單雙號區間門牌 (Range & Parity)', data: rangeQueries },
    { name: '3. 巷弄與附號門牌 (Lane / Sub-number)', data: laneQueries },
    { name: '4. 樓層與地下室條件 (Floor / Basement)', data: floorQueries },
    { name: '5. 查無結果負向查詢 (Negative Lookup)', data: negativeQueries },
  ];

  console.log(`查詢場景與工作負載類型 | 平均延遲 (Mean) | 中位數 (P50) | P95 延遲 | P99 延遲 | QPS 吞吐量 | 特點說明`);
  console.log(`:-------------------- | :-------------: | :----------: | :------: | :------: | :---------: | :-------`);

  for (const scen of scenarios) {
    const stats = benchmarkQueries(zipCodeTw, scen.data, 5000);
    let note = '';
    if (scen.name.includes('Exact')) note = '單點命中，位元遮罩快速通過';
    else if (scen.name.includes('Range')) note = '數值介於起訖區間比較';
    else if (scen.name.includes('Lane')) note = '多重附號/子號逐項解析';
    else if (scen.name.includes('Floor')) note = '樓層位元遮罩條件驗證';
    else if (scen.name.includes('Negative')) note = '倒排交集後快速退出';

    console.log(
      `**${scen.name}** | **${stats.mean.toFixed(2)} µs** | ${stats.p50.toFixed(2)} µs | ${stats.p95.toFixed(2)} µs | ${stats.p99.toFixed(2)} µs | ~${Math.round(stats.qps).toLocaleString()} | ${note}`,
    );
  }

  console.log('\n================================================================');
}

main().catch(console.error);
