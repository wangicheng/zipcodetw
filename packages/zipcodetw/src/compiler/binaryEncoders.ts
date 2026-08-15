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

export function buildBinaryPrefixes(lines: string[]): Buffer {
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

  const headerBuf = Buffer.alloc(32);
  headerBuf.write('ZPF1', 0, 4, 'ascii');
  headerBuf.writeUint16LE(1, 4);
  headerBuf.writeUint32LE(lines.length, 6);
  headerBuf.writeUint16LE(sortedChars.length, 10);
  headerBuf.writeUint16LE(BLOCK_SIZE, 12);
  headerBuf.writeUint16LE(blockCount, 14);

  let cursor = 32;
  const charMapOffset = cursor;
  cursor += charMapBuf.length;

  const postingStreamOffset = cursor;
  cursor += fullPostingStreamBuf.length;

  const blockIndexOffset = cursor;
  cursor += blockIndexBuf.length;

  const textStreamOffset = cursor;

  headerBuf.writeUint32LE(charMapOffset, 16);
  headerBuf.writeUint32LE(postingStreamOffset, 20);
  headerBuf.writeUint32LE(blockIndexOffset, 24);
  headerBuf.writeUint32LE(textStreamOffset, 28);

  return Buffer.concat([headerBuf, charMapBuf, fullPostingStreamBuf, blockIndexBuf, fullTextStreamBuf]);
}

export function buildBinaryRules(part2Entries: Part2Entry[]): Buffer {
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
      const parityVal = rule.parity ? PARITY_MAP[rule.parity] || 0 : 0;
      const subModeVal = rule.subMode ? SUB_MODE_MAP[rule.subMode] || 0 : 0;
      const unitVal = rule.unit ? UNIT_MAP[rule.unit] || 0 : 0;
      const endUnitVal = rule.endUnit ? END_UNIT_MAP[rule.endUnit] || 0 : 0;

      let ctrl1 = 0;
      if (hasValue) ctrl1 |= 1 << 0;
      if (hasMin) ctrl1 |= 1 << 1;
      if (hasMax) ctrl1 |= 1 << 2;
      ctrl1 |= (parityVal & 0x03) << 3;
      ctrl1 |= (subModeVal & 0x03) << 5;

      let ctrl2 = 0;
      ctrl2 |= unitVal & 0x0f;
      ctrl2 |= (endUnitVal & 0x0f) << 4;

      const ctrlBuf = Buffer.alloc(2);
      ctrlBuf.writeUint8(ctrl1, 0);
      ctrlBuf.writeUint8(ctrl2, 1);
      entryChunks.push(ctrlBuf);

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

  const headerBuf = Buffer.alloc(32);
  headerBuf.write('ZPR1', 0, 4, 'ascii');
  headerBuf.writeUint16LE(1, 4);
  headerBuf.writeUint16LE(zipcodeList.length, 6);
  headerBuf.writeUint32LE(part2Entries.length, 8);
  headerBuf.writeUint32LE(bulkNameList.length, 12);

  let offsetCursor = 32;
  const zipDictOffset = offsetCursor;
  offsetCursor += zipDictBuf.length;

  const bulkDictOffset = offsetCursor;
  offsetCursor += bulkDictBuf.length;

  const indexTableOffset = offsetCursor;
  offsetCursor += indexTableBuf.length;

  const ruleStreamOffset = offsetCursor;

  headerBuf.writeUint32LE(zipDictOffset, 16);
  headerBuf.writeUint32LE(bulkDictOffset, 20);
  headerBuf.writeUint32LE(indexTableOffset, 24);
  headerBuf.writeUint32LE(ruleStreamOffset, 28);

  return Buffer.concat([headerBuf, zipDictBuf, bulkDictBuf, indexTableBuf, fullRuleStreamBuf]);
}
