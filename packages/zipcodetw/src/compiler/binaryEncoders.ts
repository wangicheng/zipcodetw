import type { AddressRule, Part2Entry } from '../core/types.ts';

export const BLOCK_SIZE = 64;

// Enums
export const UNIT_MAP: Record<string, number> = {
  號: 1,
  巷: 2,
  樓: 3,
  弄: 4,
  附號: 5,
};

export const END_UNIT_MAP: Record<string, number> = {
  號: 1,
  巷: 2,
  弄: 3,
};

export const PARITY_MAP: Record<string, number> = {
  odd: 1,
  even: 2,
  連: 3,
};

export const SUB_MODE_MAP: Record<string, number> = {
  all: 1,
  sub_all: 2,
};

export function buildBinaryPrefixes(lines: string[], dataVersion: string = '2026.03'): Buffer {
  const tempIndex = new Map<string, number[]>();
  for (let id = 0; id < lines.length; id++) {
    const line = lines[id];
    const uniqueChars = new Set(line);
    for (const char of uniqueChars) {
      let list = tempIndex.get(char);
      if (!list) {
        list = [];
        tempIndex.set(char, list);
      }
      list.push(id);
    }
  }

  const sortedChars = Array.from(tempIndex.keys()).sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));

  const postingBufs: Buffer[] = [];
  const charMapBuf = Buffer.alloc(sortedChars.length * 10);
  let currentPostingOffset = 0;

  sortedChars.forEach((char, i) => {
    const ids = tempIndex.get(char)!;
    const pBuf = Buffer.alloc(ids.length * 2);
    for (let j = 0; j < ids.length; j++) {
      pBuf.writeUint16LE(ids[j], j * 2);
    }
    postingBufs.push(pBuf);

    const pos = i * 10;
    charMapBuf.writeUint16LE(char.charCodeAt(0), pos);
    charMapBuf.writeUint32LE(currentPostingOffset, pos + 2);
    charMapBuf.writeUint32LE(ids.length, pos + 6);

    currentPostingOffset += pBuf.length;
  });

  const fullPostingStreamBuf = Buffer.concat(postingBufs);

  const blockCount = Math.ceil(lines.length / BLOCK_SIZE);
  const blockIndexBuf = Buffer.alloc(blockCount * 8);

  const blockTextBufs: Buffer[] = [];
  let currentTextOffset = 0;

  for (let b = 0; b < blockCount; b++) {
    const startIdx = b * BLOCK_SIZE;
    const endIdx = Math.min(lines.length, startIdx + BLOCK_SIZE);
    const blockLines = lines.slice(startIdx, endIdx);

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

    const fullBlockBuf = Buffer.concat(blockChunks);
    blockTextBufs.push(fullBlockBuf);

    const pos = b * 8;
    blockIndexBuf.writeUint32LE(currentTextOffset, pos);
    blockIndexBuf.writeUint16LE(fullBlockBuf.length, pos + 4);
    blockIndexBuf.writeUint16LE(blockLines.length, pos + 6);

    currentTextOffset += fullBlockBuf.length;
  }

  const fullTextStreamBuf = Buffer.concat(blockTextBufs);

  const headerBuf = Buffer.alloc(48);
  headerBuf.write('ZPF2', 0, 4, 'ascii');
  headerBuf.writeUint16LE(2, 4);
  headerBuf.write(dataVersion.padEnd(8, '\0').slice(0, 8), 6, 8, 'ascii');
  headerBuf.writeUint32LE(lines.length, 14);
  headerBuf.writeUint16LE(sortedChars.length, 18);
  headerBuf.writeUint16LE(BLOCK_SIZE, 20);
  headerBuf.writeUint16LE(blockCount, 22);

  let cursor = 48;
  const charMapOffset = cursor;
  cursor += charMapBuf.length;

  const postingStreamOffset = cursor;
  cursor += fullPostingStreamBuf.length;

  const blockIndexOffset = cursor;
  cursor += blockIndexBuf.length;

  const textStreamOffset = cursor;

  headerBuf.writeUint32LE(charMapOffset, 24);
  headerBuf.writeUint32LE(postingStreamOffset, 28);
  headerBuf.writeUint32LE(blockIndexOffset, 32);
  headerBuf.writeUint32LE(textStreamOffset, 36);

  return Buffer.concat([headerBuf, charMapBuf, fullPostingStreamBuf, blockIndexBuf, fullTextStreamBuf]);
}

export function buildBinaryRules(part2Entries: Part2Entry[], dataVersion: string = '2026.03'): Buffer {
  const zipcodeSet = new Set<string>();
  const bulkNameSet = new Set<string>();

  for (const entry of part2Entries) {
    if (entry.zipcode) zipcodeSet.add(entry.zipcode);
    if (entry.bulkName) bulkNameSet.add(entry.bulkName);
  }

  const zipcodeList = Array.from(zipcodeSet);
  const zipcodeToId = new Map<string, number>();
  zipcodeList.forEach((z, i) => {
    zipcodeToId.set(z, i);
  });

  const bulkNameList = Array.from(bulkNameSet);
  const bulkNameToId = new Map<string, number>();
  bulkNameList.forEach((b, i) => {
    bulkNameToId.set(b, i + 1);
  });

  const zipDictBuf = Buffer.alloc(zipcodeList.length * 6);
  zipcodeList.forEach((z, i) => {
    zipDictBuf.write(z.padEnd(6, ' '), i * 6, 6, 'ascii');
  });

  const bulkBufs: Buffer[] = [];
  for (const name of bulkNameList) {
    const strBuf = Buffer.from(name, 'utf-8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUint16LE(strBuf.length, 0);
    bulkBufs.push(lenBuf, strBuf);
  }
  const bulkDictBuf = Buffer.concat(bulkBufs);

  const ruleStreamBufs: Buffer[] = [];
  const entryOffsets: number[] = [];
  let currentOffset = 0;

  for (const entry of part2Entries) {
    entryOffsets.push(currentOffset);
    const entryChunks: Buffer[] = [];

    const rulesCount = entry.rules.length;
    const countBuf = Buffer.alloc(1);
    countBuf.writeUint8(rulesCount, 0);
    entryChunks.push(countBuf);

    for (const rule of entry.rules) {
      const hasValue = !!(rule.value && rule.value.length > 0);
      const hasMin = !!(rule.min && rule.min.length > 0);
      const hasMax = !!(rule.max && rule.max.length > 0);

      const parityCode = PARITY_MAP[rule.parity || ''] || 0;
      const subModeCode = SUB_MODE_MAP[rule.subMode || ''] || 0;
      const unitCode = UNIT_MAP[rule.unit || ''] || 0;
      const endUnitCode = END_UNIT_MAP[rule.endUnit || ''] || 0;

      let byte1 = 0;
      if (hasValue) byte1 |= 0x01;
      if (hasMin) byte1 |= 0x02;
      if (hasMax) byte1 |= 0x04;
      byte1 |= (parityCode & 0x03) << 3;
      byte1 |= (subModeCode & 0x03) << 5;

      let byte2 = 0;
      byte2 |= unitCode & 0x0f;
      byte2 |= (endUnitCode & 0x0f) << 4;

      const flagBuf = Buffer.alloc(2);
      flagBuf.writeUint8(byte1, 0);
      flagBuf.writeUint8(byte2, 1);
      entryChunks.push(flagBuf);

      if (hasValue) {
        const valArr = rule.value!;
        const pBuf = Buffer.alloc(1 + valArr.length * 2);
        pBuf.writeUint8(valArr.length, 0);
        for (let i = 0; i < valArr.length; i++) {
          pBuf.writeInt16LE(valArr[i], 1 + i * 2);
        }
        entryChunks.push(pBuf);
      }

      if (hasMin) {
        const minArr = rule.min!;
        const pBuf = Buffer.alloc(1 + minArr.length * 2);
        pBuf.writeUint8(minArr.length, 0);
        for (let i = 0; i < minArr.length; i++) {
          pBuf.writeInt16LE(minArr[i], 1 + i * 2);
        }
        entryChunks.push(pBuf);
      }

      if (hasMax) {
        const maxArr = rule.max!;
        const pBuf = Buffer.alloc(1 + maxArr.length * 2);
        pBuf.writeUint8(maxArr.length, 0);
        for (let i = 0; i < maxArr.length; i++) {
          pBuf.writeInt16LE(maxArr[i], 1 + i * 2);
        }
        entryChunks.push(pBuf);
      }
    }

    const entryBuf = Buffer.concat(entryChunks);
    ruleStreamBufs.push(entryBuf);
    currentOffset += entryBuf.length;
  }
  const fullRuleStreamBuf = Buffer.concat(ruleStreamBufs);

  const indexTableBuf = Buffer.alloc(part2Entries.length * 10);
  for (let i = 0; i < part2Entries.length; i++) {
    const entry = part2Entries[i];
    const zId = zipcodeToId.get(entry.zipcode) ?? 0;
    const bId = entry.bulkName ? (bulkNameToId.get(entry.bulkName) ?? 0) : 0;
    const offset = entryOffsets[i];

    const pos = i * 10;
    indexTableBuf.writeUint16LE(entry.part1Index, pos);
    indexTableBuf.writeUint16LE(zId, pos + 2);
    indexTableBuf.writeUint16LE(bId, pos + 4);
    indexTableBuf.writeUint32LE(offset, pos + 6);
  }

  const headerBuf = Buffer.alloc(48);
  headerBuf.write('ZPR2', 0, 4, 'ascii');
  headerBuf.writeUint16LE(2, 4);
  headerBuf.write(dataVersion.padEnd(8, '\0').slice(0, 8), 6, 8, 'ascii');
  headerBuf.writeUint16LE(zipcodeList.length, 14);
  headerBuf.writeUint32LE(part2Entries.length, 16);
  headerBuf.writeUint32LE(bulkNameList.length, 20);

  let offsetCursor = 48;
  const zipDictOffset = offsetCursor;
  offsetCursor += zipDictBuf.length;

  const bulkDictOffset = offsetCursor;
  offsetCursor += bulkDictBuf.length;

  const indexTableOffset = offsetCursor;
  offsetCursor += indexTableBuf.length;

  const ruleStreamOffset = offsetCursor;

  headerBuf.writeUint32LE(zipDictOffset, 24);
  headerBuf.writeUint32LE(bulkDictOffset, 28);
  headerBuf.writeUint32LE(indexTableOffset, 32);
  headerBuf.writeUint32LE(ruleStreamOffset, 36);

  return Buffer.concat([headerBuf, zipDictBuf, bulkDictBuf, indexTableBuf, fullRuleStreamBuf]);
}
