import { loadOfficialRawAddresses } from '../scripts/crawler/fetch_official_dbf.ts';

async function main() {
  const rawAddresses = await loadOfficialRawAddresses();
  const part1Set = new Set<string>();
  for (const item of rawAddresses) {
    const sec = item.section && item.section !== '0' ? item.section : '';
    const p1 = `${item.city}${item.district}${item.road}${sec}`;
    if (p1) part1Set.add(p1);
  }
  const sortedPrefixes = Array.from(part1Set).sort();

  function testBlockSizeRigor(blockSize: number, iterations = 10, queriesPerRun = 10000) {
    const blockCount = Math.ceil(sortedPrefixes.length / blockSize);
    const blockIndexBuf = Buffer.alloc(blockCount * 8);
    const blockTextBufs: Buffer[] = [];

    for (let b = 0; b < blockCount; b++) {
      const startIdx = b * blockSize;
      const endIdx = Math.min(sortedPrefixes.length, startIdx + blockSize);
      const blockLines = sortedPrefixes.slice(startIdx, endIdx);
      const blockChunks: Buffer[] = [];
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
      blockTextBufs.push(Buffer.concat(blockChunks));
    }

    const textBuf = Buffer.concat(blockTextBufs);
    const totalSize = blockIndexBuf.length + textBuf.length;
    const decoder = new TextDecoder('utf-8');

    const warmUpCount = blockSize > 2048 ? 200 : blockSize > 512 ? 1000 : 5000;
    const effectiveQueries = blockSize > 2048 ? 300 : blockSize > 512 ? 1000 : 5000;

    // 1. V8 JIT 預熱
    for (let q = 0; q < warmUpCount; q++) {
      const targetId = Math.floor(Math.random() * sortedPrefixes.length);
      const blockIdx = Math.floor(targetId / blockSize);
      const offsetInBlock = targetId % blockSize;
      const buf = blockTextBufs[blockIdx];
      let cursor = 0;
      const anchorLen = buf.readUint16LE(cursor);
      cursor += 2;
      if (offsetInBlock === 0) {
        decoder.decode(buf.subarray(cursor, cursor + anchorLen));
        continue;
      }
      const currentBytes = new Uint8Array(128);
      currentBytes.set(buf.subarray(cursor, cursor + anchorLen), 0);
      let currentLen = anchorLen;
      cursor += anchorLen;
      for (let i = 1; i <= offsetInBlock; i++) {
        const sharedBytes = buf[cursor++];
        const remLen = buf[cursor++];
        currentBytes.set(buf.subarray(cursor, cursor + remLen), sharedBytes);
        currentLen = sharedBytes + remLen;
        cursor += remLen;
      }
      decoder.decode(currentBytes.subarray(0, currentLen));
    }

    // 2. 執行 10 次獨立實驗取平均與標準差 (Mean & Standard Deviation)
    const runUsLatencies: number[] = [];

    for (let r = 0; r < iterations; r++) {
      const testIds: number[] = [];
      for (let q = 0; q < effectiveQueries; q++) {
        testIds.push(Math.floor(Math.random() * sortedPrefixes.length));
      }

      const start = performance.now();
      for (let q = 0; q < effectiveQueries; q++) {
        const targetId = testIds[q];
        const blockIdx = Math.floor(targetId / blockSize);
        const offsetInBlock = targetId % blockSize;
        const buf = blockTextBufs[blockIdx];
        let cursor = 0;
        const anchorLen = buf.readUint16LE(cursor);
        cursor += 2;
        if (offsetInBlock === 0) {
          decoder.decode(buf.subarray(cursor, cursor + anchorLen));
          continue;
        }
        const currentBytes = new Uint8Array(128);
        currentBytes.set(buf.subarray(cursor, cursor + anchorLen), 0);
        let currentLen = anchorLen;
        cursor += anchorLen;
        for (let i = 1; i <= offsetInBlock; i++) {
          const sharedBytes = buf[cursor++];
          const remLen = buf[cursor++];
          currentBytes.set(buf.subarray(cursor, cursor + remLen), sharedBytes);
          currentLen = sharedBytes + remLen;
          cursor += remLen;
        }
        decoder.decode(currentBytes.subarray(0, currentLen));
      }
      const end = performance.now();
      const avgUs = ((end - start) / effectiveQueries) * 1000;
      runUsLatencies.push(avgUs);
    }

    const mean = runUsLatencies.reduce((a, b) => a + b, 0) / iterations;
    const variance = runUsLatencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / iterations;
    const stdDev = Math.sqrt(variance);

    return {
      blockSize,
      blockCount,
      textKB: (textBuf.length / 1024).toFixed(2),
      indexKB: (blockIndexBuf.length / 1024).toFixed(2),
      totalKB: (totalSize / 1024).toFixed(2),
      meanUs: mean.toFixed(2),
      stdDevUs: stdDev.toFixed(2),
    };
  }

  console.log('【Block Size 超參數敏感度分析 (Hyperparameter Sensitivity Analysis with 10 Runs Warm-up)】\n');
  const sizes = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, sortedPrefixes.length];
  const results = sizes.map((s) => testBlockSizeRigor(s, 10));

  console.log(
    '| 區塊大小 ($K$) | 區塊總數 | 文字流體積 | 區塊索引表體積 | 前綴資產總體積 | 單次解碼延遲 ($\\mu \\pm \\sigma \\ \\mu\\text{s}$) | 說明 |',
  );
  console.log('| :---: | :---: | :---: | :---: | :---: | :---: | :--- |');
  for (const r of results) {
    let note = '';
    if (r.blockSize === 16) note = '區塊過多，索引表與 Anchor 體積過大';
    else if (r.blockSize === 32) note = '解碼極快，體積略高';
    else if (r.blockSize === 64) note = '現行預設值';
    else if (r.blockSize === 512) note = '中大型區塊，體積進一步縮減';
    else if (r.blockSize === 2048) note = '大型區塊';
    else if (r.blockSize === sortedPrefixes.length) note = '極限：單一大區塊 (Single Block)';

    console.log(
      `| **${r.blockSize}** | ${r.blockCount} | ${r.textKB} KB | ${r.indexKB} KB | **${r.totalKB} KB** | **${r.meanUs} \\pm ${r.stdDevUs} \\ \\mu\\text{s}** | ${note} |`,
    );
  }
}

main().catch(console.error);
