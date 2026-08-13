import fs from 'node:fs';

import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from '../src/core/constants.ts';
import { createZipCodeTw } from '../src/node.ts';

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external || 0,
    arrayBuffers: mem.arrayBuffers || 0,
  };
}

async function main() {
  console.log('====================================================');
  console.log(' 📊 ZipCodeTw 全二進制零展開引擎效能與資源報告');
  console.log('====================================================\n');

  console.log('【1. 硬碟資產檔案體積 (Disk Asset Sizes)】');
  if (fs.existsSync(ADDRESS_PREFIXES_PATH)) {
    const binPrefixStat = fs.statSync(ADDRESS_PREFIXES_PATH);
    console.log(`  - 前綴二進制索引檔 (address_prefixes.bin) : ${formatMB(binPrefixStat.size)} ✨`);
  }
  if (fs.existsSync(ZIPCODE_RULES_PATH)) {
    const binRulesStat = fs.statSync(ZIPCODE_RULES_PATH);
    console.log(`  - 郵遞區號 二進制規則檔 (zipcode_rules.bin) : ${formatMB(binRulesStat.size)} ✨`);
  }
  console.log('');

  const testQueries = [
    '臺北市大安區和平東路三段1巷40號',
    '新北市板橋區中山路一段181號',
    '臺中市西屯區台灣大道三段99號',
    '高雄市苓雅區四維三路2號',
    '新竹市東區力行路1號',
  ];

  if (typeof global.gc === 'function') global.gc();
  const memBefore = getMemorySnapshot();

  const startLoad = performance.now();
  const zipCodeTw = await createZipCodeTw();
  const endLoad = performance.now();

  if (typeof global.gc === 'function') global.gc();
  const memAfter = getMemorySnapshot();

  const searchStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    zipCodeTw.search(testQueries[i % testQueries.length]);
  }
  const searchEnd = performance.now();

  const heapDelta = memAfter.heapUsed - memBefore.heapUsed;
  const rssDelta = memAfter.rss - memBefore.rss;

  console.log('【2. 效能與記憶體數據 (Performance Metrics)】');
  console.log(`  - 引擎載入與預處理耗時 (Load Time)  : ${(endLoad - startLoad).toFixed(2)} ms`);
  console.log(`  - V8 Heap 堆記憶體淨增長 (Heap Delta): ${formatMB(heapDelta)}`);
  console.log(`  - 進程總記憶體淨增長 (RSS Delta)    : ${formatMB(rssDelta)}`);
  console.log(`  - 10,000 次查詢總耗時 (Total Time)  : ${(searchEnd - searchStart).toFixed(2)} ms`);
  console.log(
    `  - 單次查詢平均耗時 (Avg Query Time)  : ${((searchEnd - searchStart) / 10000).toFixed(4)} ms (${(((searchEnd - searchStart) / 10000) * 1000).toFixed(2)} 微秒)`,
  );
  console.log('\n====================================================\n');
}

main().catch(console.error);
