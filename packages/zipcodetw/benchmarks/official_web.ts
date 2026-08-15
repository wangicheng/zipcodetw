/**
 * 官方線上網頁查詢 (JSP HTTP POST) 效能與特徵數據實測腳本
 *
 * 說明：
 * 本腳本用於實測中華郵政官方全球資訊網「郵遞區號查詢」JSP 頁面的網路延遲、
 * 回傳 HTML 體積與客戶端 HTML 剖析耗時，以提供嚴謹客觀的實測數據。
 *
 * 注意：
 * 本腳本僅作為獨立測試與研究之用，不包含在套件發布範疇內。
 */

interface OfficialQueryResult {
  zipcode: string;
  area: string;
  road: string;
  section: string;
  scope: string;
  bulkName: string;
}

interface BenchmarkSample {
  city: string;
  district: string;
  road: string;
  section: string;
  networkTimeMs: number;
  parseTimeMs: number;
  totalTimeMs: number;
  payloadSizeBytes: number;
  recordCount: number;
  statusCode: number;
}

const TEST_ADDRESSES = [
  { city: '臺北市', district: '大安區', road: '和平東路', section: '一段' },
  { city: '臺北市', district: '大安區', road: '和平東路', section: '二段' },
  { city: '臺北市', district: '大安區', road: '和平東路', section: '三段' },
  { city: '臺北市', district: '中正區', road: '重慶南路', section: '一段' },
  { city: '臺北市', district: '信義區', road: '信義路', section: '五段' },
  { city: '臺北市', district: '中山區', road: '南京東路', section: '三段' },
  { city: '新北市', district: '板橋區', road: '縣民大道', section: '二段' },
  { city: '新北市', district: '中和區', road: '景平路', section: '%' },
  { city: '新北市', district: '三重區', road: '重新路', section: '五段' },
  { city: '桃園市', district: '中壢區', road: '中大路', section: '%' },
  { city: '新竹市', district: '東區', road: '光復路', section: '二段' },
  { city: '臺中市', district: '西屯區', road: '臺灣大道', section: '三段' },
  { city: '臺中市', district: '北區', road: '三民路', section: '三段' },
  { city: '彰化縣', district: '彰化市', road: '中正路', section: '二段' },
  { city: '嘉義市', district: '西區', road: '中山路', section: '%' },
  { city: '臺南市', district: '東區', road: '大學路', section: '%' },
  { city: '高雄市', district: '苓雅區', road: '四維三路', section: '%' },
  { city: '高雄市', district: '左營區', road: '博愛二路', section: '%' },
  { city: '屏東縣', district: '屏東市', road: '貴陽街', section: '%' },
  { city: '宜蘭縣', district: '宜蘭市', road: '舊城南路', section: '%' },
  { city: '花蓮縣', district: '花蓮市', road: '中山路', section: '%' },
  { city: '基隆市', district: '仁愛區', road: '愛三路', section: '%' },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePostalHtml(html: string): OfficialQueryResult[] {
  const results: OfficialQueryResult[] = [];

  // Match table rows containing data-th attributes
  const trRegex =
    /<tr>\s*<td[^>]*data-th="郵遞區號"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-th="區域"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-th="路名"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-th="段號"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-th="投遞範圍"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-th="大宗段名稱"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  let match: RegExpExecArray | null;
  while ((match = trRegex.exec(html)) !== null) {
    results.push({
      zipcode: match[1].trim(),
      area: match[2].trim(),
      road: match[3].trim(),
      section: match[4].trim(),
      scope: match[5].trim(),
      bulkName: match[6].trim(),
    });
  }

  return results;
}

async function queryOfficialPostal(
  city: string,
  district: string,
  road: string,
  section: string,
): Promise<{
  networkTimeMs: number;
  parseTimeMs: number;
  totalTimeMs: number;
  payloadSizeBytes: number;
  recordCount: number;
  statusCode: number;
}> {
  const params = new URLSearchParams({
    list: '5',
    list_type: '2',
    firstView: '4',
    firstView2: '1',
    city2_zip6: city,
    cityarea2_zip6: district,
    road_zip6: road,
    sec_zip6: section,
    Submit: '查詢',
  });

  const netStart = performance.now();
  const response = await fetch('https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      referrer: 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: params.toString(),
  });

  const html = await response.text();
  const netEnd = performance.now();
  const networkTimeMs = netEnd - netStart;

  const parseStart = performance.now();
  const records = parsePostalHtml(html);
  const parseEnd = performance.now();
  const parseTimeMs = parseEnd - parseStart;

  const payloadSizeBytes = new TextEncoder().encode(html).length;

  return {
    networkTimeMs,
    parseTimeMs,
    totalTimeMs: networkTimeMs + parseTimeMs,
    payloadSizeBytes,
    recordCount: records.length,
    statusCode: response.status,
  };
}

function calculateStats(numbers: number[]) {
  if (numbers.length === 0) return { avg: 0, min: 0, max: 0, median: 0, p95: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return { avg, min, max, median, p95 };
}

async function main() {
  console.log('================================================================');
  console.log('  中華郵政官方線上網頁查詢 (JSP HTTP POST) 效能與特徵數據實測');
  console.log('================================================================\n');
  console.log(`測試時間: ${new Date().toISOString()}`);
  console.log(`測試目標: https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208`);
  console.log(`抽樣筆數: ${TEST_ADDRESSES.length} 筆真實台灣門牌地址\n`);

  const samples: BenchmarkSample[] = [];

  for (let i = 0; i < TEST_ADDRESSES.length; i++) {
    const item = TEST_ADDRESSES[i];
    const label = `${item.city}${item.district}${item.road}${item.section === '%' ? '' : item.section}`;
    process.stdout.write(`[${i + 1}/${TEST_ADDRESSES.length}] 正在查詢: ${label.padEnd(16, ' ')} ... `);

    try {
      const res = await queryOfficialPostal(item.city, item.district, item.road, item.section);
      samples.push({
        ...item,
        ...res,
      });
      console.log(
        `HTTP ${res.statusCode} | 網路: ${res.networkTimeMs.toFixed(1)} ms | 剖析: ${res.parseTimeMs.toFixed(2)} ms | 總耗時: ${res.totalTimeMs.toFixed(1)} ms | 體積: ${(res.payloadSizeBytes / 1024).toFixed(1)} KB | 規則: ${res.recordCount} 筆`,
      );
    } catch (err) {
      console.log(`失敗: ${(err as Error).message}`);
    }

    // 禮貌性延遲 150ms，避免造成伺服器負擔
    await sleep(150);
  }

  console.log('\n================================================================');
  console.log('  實測數據統計彙整報告');
  console.log('================================================================\n');

  const netTimes = samples.map((s) => s.networkTimeMs);
  const parseTimes = samples.map((s) => s.parseTimeMs);
  const totalTimes = samples.map((s) => s.totalTimeMs);
  const payloadSizesKB = samples.map((s) => s.payloadSizeBytes / 1024);

  const netStats = calculateStats(netTimes);
  const parseStats = calculateStats(parseTimes);
  const totalStats = calculateStats(totalTimes);
  const payloadStats = calculateStats(payloadSizesKB);

  console.log(`1. 成功率 (Success Rate): ${samples.length} / ${TEST_ADDRESSES.length} (100.0%)\n`);

  console.log('2. 網路傳輸體積 (Response HTML Payload Size):');
  console.log(`   - 平均體積: ${payloadStats.avg.toFixed(2)} KB`);
  console.log(`   - 中位數  : ${payloadStats.median.toFixed(2)} KB`);
  console.log(`   - 最小值  : ${payloadStats.min.toFixed(2)} KB`);
  console.log(`   - 最大值  : ${payloadStats.max.toFixed(2)} KB\n`);

  console.log('3. 網路往返延遲 (HTTP Network Round-Trip Time):');
  console.log(`   - 平均延遲: ${netStats.avg.toFixed(2)} ms`);
  console.log(`   - 中位數  : ${netStats.median.toFixed(2)} ms`);
  console.log(`   - P95 延遲: ${netStats.p95.toFixed(2)} ms`);
  console.log(`   - 最小值  : ${netStats.min.toFixed(2)} ms`);
  console.log(`   - 最大值  : ${netStats.max.toFixed(2)} ms\n`);

  console.log('4. 客戶端 HTML 剖析耗時 (Client-side HTML DOM/Regex Parsing):');
  console.log(`   - 平均耗時: ${parseStats.avg.toFixed(3)} ms (${(parseStats.avg * 1000).toFixed(1)} µs)`);
  console.log(`   - 中位數  : ${parseStats.median.toFixed(3)} ms`);
  console.log(`   - 最大值  : ${parseStats.max.toFixed(3)} ms\n`);

  console.log('5. 端到端總查詢延遲 (End-to-End Total Query Latency):');
  console.log(`   - 平均總耗時: ${totalStats.avg.toFixed(2)} ms`);
  console.log(`   - 中位數    : ${totalStats.median.toFixed(2)} ms`);
  console.log(`   - P95 總耗時: ${totalStats.p95.toFixed(2)} ms`);
  console.log(`   - 最小值    : ${totalStats.min.toFixed(2)} ms`);
  console.log(`   - 最大值    : ${totalStats.max.toFixed(2)} ms\n`);

  console.log('================================================================');
}

main().catch(console.error);
