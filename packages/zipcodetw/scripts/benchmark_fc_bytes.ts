import fs from 'node:fs';
import path from 'node:path';

const BLOCK_SIZE = 64;

// 讀取真實門牌前綴資料
const rawDataPath = path.join(__dirname, '../data/raw_addresses.json');
const rawAddresses: Array<{ city: string; district: string; road: string; section: string }> = JSON.parse(
  fs.readFileSync(rawDataPath, 'utf-8'),
);
const part1Set = new Set<string>();
for (const item of rawAddresses) {
  const sec = item.section && item.section !== '0' ? item.section : '';
  const p1 = `${item.city}${item.district}${item.road}${sec}`;
  if (p1) part1Set.add(p1);
}
const sortedPrefixes = Array.from(part1Set).sort();
console.log(`總門牌前綴數量: ${sortedPrefixes.length} 條\n`);

// ---------------------------------------------------------
// 方案 A：現行「Unicode 字元數 (Char Count)」
// ---------------------------------------------------------
function buildCharCountBinary(lines: string[]): Buffer {
  const blockCount = Math.ceil(lines.length / BLOCK_SIZE);
  const blockChunks: Buffer[] = [];

  for (let b = 0; b < blockCount; b++) {
    const startIdx = b * BLOCK_SIZE;
    const endIdx = Math.min(lines.length, startIdx + BLOCK_SIZE);
    const blockLines = lines.slice(startIdx, endIdx);
    let prevLine = '';

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];
      if (i === 0) {
        const anchorBuf = Buffer.from(line, 'utf-8');
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUint16LE(anchorBuf.length, 0);
        blockChunks.push(lenBuf, anchorBuf);
        prevLine = line;
      } else {
        let shared = 0;
        const minLen = Math.min(prevLine.length, line.length);
        while (shared < minLen && prevLine[shared] === line[shared]) {
          shared++;
        }
        const remainder = line.slice(shared);
        const remBuf = Buffer.from(remainder, 'utf-8');
        const headBuf = Buffer.alloc(2);
        headBuf.writeUint8(shared, 0);
        headBuf.writeUint8(remBuf.length, 1);
        blockChunks.push(headBuf, remBuf);
        prevLine = line;
      }
    }
  }
  return Buffer.concat(blockChunks);
}

// ---------------------------------------------------------
// 方案 B：使用者提議「UTF-8 Byte Count (位元組數)」
// ---------------------------------------------------------
function buildByteCountBinary(lines: string[]): Buffer {
  const blockCount = Math.ceil(lines.length / BLOCK_SIZE);
  const blockChunks: Buffer[] = [];

  for (let b = 0; b < blockCount; b++) {
    const startIdx = b * BLOCK_SIZE;
    const endIdx = Math.min(lines.length, startIdx + BLOCK_SIZE);
    const blockLines = lines.slice(startIdx, endIdx);
    let prevBuf = Buffer.alloc(0);

    for (let i = 0; i < blockLines.length; i++) {
      const lineBuf = Buffer.from(blockLines[i], 'utf-8');
      if (i === 0) {
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUint16LE(lineBuf.length, 0);
        blockChunks.push(lenBuf, lineBuf);
        prevBuf = lineBuf;
      } else {
        let sharedBytes = 0;
        const minLen = Math.min(prevBuf.length, lineBuf.length);
        while (sharedBytes < minLen && prevBuf[sharedBytes] === lineBuf[sharedBytes]) {
          sharedBytes++;
        }
        const remBuf = lineBuf.subarray(sharedBytes);
        const headBuf = Buffer.alloc(2);
        headBuf.writeUint8(sharedBytes, 0);
        headBuf.writeUint8(remBuf.length, 1);
        blockChunks.push(headBuf, remBuf);
        prevBuf = lineBuf;
      }
    }
  }
  return Buffer.concat(blockChunks);
}

const charBuf = buildCharCountBinary(sortedPrefixes);
const byteBuf = buildByteCountBinary(sortedPrefixes);

console.log(`【1. 二進位儲存體積】`);
console.log(`  - 方案 A (Char Count): ${(charBuf.length / 1024).toFixed(2)} KB`);
console.log(`  - 方案 B (Byte Count): ${(byteBuf.length / 1024).toFixed(2)} KB\n`);

// ---------------------------------------------------------
// 解碼模擬
// ---------------------------------------------------------
const decoder = new TextDecoder('utf-8');

// 解碼 方案 A: JS String 拼接
function decodeCharCountBlock(buf: Buffer, targetOffset: number): string {
  let cursor = 0;
  const anchorLen = buf.readUint16LE(cursor);
  cursor += 2;
  let currentStr = decoder.decode(buf.subarray(cursor, cursor + anchorLen));
  cursor += anchorLen;

  if (targetOffset === 0) return currentStr;

  for (let i = 1; i <= targetOffset; i++) {
    const shared = buf[cursor++];
    const remLen = buf[cursor++];
    const remStr = decoder.decode(buf.subarray(cursor, cursor + remLen));
    cursor += remLen;
    currentStr = currentStr.substring(0, shared) + remStr;
  }
  return currentStr;
}

// 解碼 方案 B: 純 Uint8Array 位元組拷貝與延遲解碼 (Zero JS String Object until end!)
function decodeByteCountBlock(buf: Buffer, targetOffset: number): string {
  let cursor = 0;
  const anchorLen = buf.readUint16LE(cursor);
  cursor += 2;

  let currentBytes = new Uint8Array(128);
  currentBytes.set(buf.subarray(cursor, cursor + anchorLen), 0);
  let currentLen = anchorLen;
  cursor += anchorLen;

  if (targetOffset === 0) {
    return decoder.decode(currentBytes.subarray(0, currentLen));
  }

  for (let i = 1; i <= targetOffset; i++) {
    const sharedBytes = buf[cursor++];
    const remLen = buf[cursor++];

    // 將 remLen 位元組複製到 currentBytes 偏移 sharedBytes 處
    currentBytes.set(buf.subarray(cursor, cursor + remLen), sharedBytes);
    currentLen = sharedBytes + remLen;
    cursor += remLen;
  }

  return decoder.decode(currentBytes.subarray(0, currentLen));
}

// 產生 100,000 次隨機查詢 Offset (0~63)
const numQueries = 100000;
const testOffsets: number[] = [];
for (let i = 0; i < numQueries; i++) {
  testOffsets.push(Math.floor(Math.random() * 32) + 16); // 平均位於區塊中間 (16~47)
}

// 切割第一個區塊的二進位資料作為基準測試
const block0Char = charBuf.subarray(0, 2000);
const block0Byte = byteBuf.subarray(0, 2000);

console.log(`【2. 解碼效能測試 (${numQueries.toLocaleString()} 次區塊隨機解碼)】`);

// 測試 方案 A
if (typeof global.gc === 'function') global.gc();
const memBeforeA = process.memoryUsage().heapUsed;
const startA = performance.now();
for (let i = 0; i < numQueries; i++) {
  decodeCharCountBlock(block0Char, testOffsets[i]);
}
const endA = performance.now();
const memAfterA = process.memoryUsage().heapUsed;

// 測試 方案 B
if (typeof global.gc === 'function') global.gc();
const memBeforeB = process.memoryUsage().heapUsed;
const startB = performance.now();
for (let i = 0; i < numQueries; i++) {
  decodeByteCountBlock(block0Byte, testOffsets[i]);
}
const endB = performance.now();
const memAfterB = process.memoryUsage().heapUsed;

console.log(
  `  - 方案 A (Char Count + JS String): ${(endA - startA).toFixed(2)} ms (單次 ${(((endA - startA) / numQueries) * 1000).toFixed(2)} ns)`,
);
console.log(
  `  - 方案 B (Byte Count + Pure Uint8Array Delay Decode): ${(endB - startB).toFixed(2)} ms (單次 ${(((endB - startB) / numQueries) * 1000).toFixed(2)} ns)`,
);

console.log(`\n【3. 記憶體開銷 (Heap Used Delta)】`);
console.log(`  - 方案 A Heap Delta: ${((memAfterA - memBeforeA) / 1024).toFixed(2)} KB`);
console.log(`  - 方案 B Heap Delta: ${((memAfterB - memBeforeB) / 1024).toFixed(2)} KB`);

// 驗證正確性
const testIdx = 25;
const resA = decodeCharCountBlock(block0Char, testIdx);
const resB = decodeByteCountBlock(block0Byte, testIdx);
console.log(`\n【4. 輸出解碼比對驗證 (Offset #${testIdx})】`);
console.log(`  - 方案 A 解碼結果: "${resA}"`);
console.log(`  - 方案 B 解碼結果: "${resB}"`);
console.log(`  - 兩者字串一致: ${resA === resB ? '完全一致' : '不一致'}`);
