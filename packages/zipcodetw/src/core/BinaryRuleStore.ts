import { formatAddressRule } from './formatRule.ts';
import type { AddressRule, Part2Entry } from './types.ts';

export const REVERSE_UNIT_MAP: Record<number, string> = {
  1: '號',
  2: '巷',
  3: '樓',
  4: '弄',
  5: '附號',
};

export const REVERSE_END_UNIT_MAP: Record<number, string> = {
  1: '號',
  2: '巷',
  3: '弄',
};

export const REVERSE_PARITY_MAP: Record<number, string> = {
  1: 'odd',
  2: 'even',
  3: '連',
};

export const REVERSE_SUB_MODE_MAP: Record<number, string> = {
  1: 'all',
  2: 'sub_all',
};

export class BinaryRuleStore {
  private buffer: Uint8Array;
  private view: DataView;

  // Header info
  public readonly formatVersion: number;
  public readonly dataVersion: string;
  public readonly zipcodeCount: number;
  public readonly entryCount: number;
  public readonly bulkNameCount: number;

  private zipDictOffset: number;
  private bulkDictOffset: number;
  private indexTableOffset: number;
  private ruleStreamOffset: number;

  // Cached string tables
  private zipcodes: string[] = [];
  private bulkNames: string[] = [];

  constructor(arrayBuffer: ArrayBuffer | Uint8Array) {
    if (arrayBuffer instanceof Uint8Array) {
      if (arrayBuffer.byteOffset % 2 !== 0) {
        this.buffer = new Uint8Array(arrayBuffer.slice().buffer);
      } else {
        this.buffer = arrayBuffer;
      }
    } else {
      this.buffer = new Uint8Array(arrayBuffer);
    }
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);

    const magic = String.fromCharCode(this.buffer[0], this.buffer[1], this.buffer[2], this.buffer[3]);
    if (magic === 'ZPR2') {
      this.formatVersion = this.view.getUint16(4, true);
      const versionBytes = this.buffer.subarray(6, 14);
      this.dataVersion = new TextDecoder('ascii').decode(versionBytes).replaceAll('\0', '').trim();

      this.zipcodeCount = this.view.getUint16(14, true);
      this.entryCount = this.view.getUint32(16, true);
      this.bulkNameCount = this.view.getUint32(20, true);

      this.zipDictOffset = this.view.getUint32(24, true);
      this.bulkDictOffset = this.view.getUint32(28, true);
      this.indexTableOffset = this.view.getUint32(32, true);
      this.ruleStreamOffset = this.view.getUint32(36, true);
    } else if (magic === 'ZPR1') {
      this.formatVersion = 1;
      this.dataVersion = 'legacy';
      this.zipcodeCount = this.view.getUint16(6, true);
      this.entryCount = this.view.getUint32(8, true);
      this.bulkNameCount = this.view.getUint32(12, true);

      this.zipDictOffset = this.view.getUint32(16, true);
      this.bulkDictOffset = this.view.getUint32(20, true);
      this.indexTableOffset = this.view.getUint32(24, true);
      this.ruleStreamOffset = this.view.getUint32(28, true);
    } else {
      throw new Error(`Invalid binary rules magic header: ${magic}`);
    }

    this.parseZipcodeDict();
    this.parseBulkNameDict();
  }

  public getDataVersion(): string {
    return this.dataVersion;
  }

  private parseZipcodeDict(): void {
    const decoder = new TextDecoder('ascii');
    for (let i = 0; i < this.zipcodeCount; i++) {
      const pos = this.zipDictOffset + i * 6;
      const str = decoder.decode(this.buffer.subarray(pos, pos + 6)).trim();
      this.zipcodes.push(str);
    }
  }

  private parseBulkNameDict(): void {
    const decoder = new TextDecoder('utf-8');
    let cursor = this.bulkDictOffset;
    this.bulkNames.push(''); // Id 0 = empty string

    for (let i = 0; i < this.bulkNameCount; i++) {
      const len = this.view.getUint16(cursor, true);
      cursor += 2;
      const name = decoder.decode(this.buffer.subarray(cursor, cursor + len));
      cursor += len;
      this.bulkNames.push(name);
    }
  }

  public getZipcode(id: number): string {
    return this.zipcodes[id] || '';
  }

  public getBulkName(id: number): string {
    return this.bulkNames[id] || '';
  }

  /**
   * Binary search entry index range matching part1Index
   * @returns array of entry indices
   */
  public searchEntriesByPart1(part1Index: number): number[] {
    let left = 0;
    let right = this.entryCount - 1;
    let found = -1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const midPart1 = this.view.getUint16(this.indexTableOffset + mid * 10, true);
      if (midPart1 < part1Index) {
        left = mid + 1;
      } else if (midPart1 > part1Index) {
        right = mid - 1;
      } else {
        found = mid;
        right = mid - 1; // find first occurrence
      }
    }

    if (found === -1) return [];

    const results: number[] = [];
    for (let i = found; i < this.entryCount; i++) {
      const p1 = this.view.getUint16(this.indexTableOffset + i * 10, true);
      if (p1 === part1Index) {
        results.push(i);
      } else {
        break;
      }
    }
    return results;
  }

  public getEntryZipcodeId(entryIndex: number): number {
    return this.view.getUint16(this.indexTableOffset + entryIndex * 10 + 2, true);
  }

  public getEntryBulkNameId(entryIndex: number): number {
    return this.view.getUint16(this.indexTableOffset + entryIndex * 10 + 4, true);
  }

  public getEntryRuleOffset(entryIndex: number): number {
    const relativeOffset = this.view.getUint32(this.indexTableOffset + entryIndex * 10 + 6, true);
    return this.ruleStreamOffset + relativeOffset;
  }

  /**
   * Fast Zero-Copy Rule Matcher directly against binary buffer
   */
  public matchAddressBinary(addressNumbers: number[], entryIndex: number): boolean {
    let cursor = this.getEntryRuleOffset(entryIndex);
    const rulesCount = this.buffer[cursor++];
    let addrIdx = 0;

    for (let r = 0; r < rulesCount; r++) {
      const ctrl1 = this.buffer[cursor++];
      const ctrl2 = this.buffer[cursor++];

      const hasValue = (ctrl1 & 0x01) !== 0;
      const hasMin = (ctrl1 & 0x02) !== 0;
      const hasMax = (ctrl1 & 0x04) !== 0;
      const parity = (ctrl1 >> 3) & 0x03;
      const subMode = (ctrl1 >> 5) & 0x03;
      const unit = ctrl2 & 0x0f;

      let valLen = 0,
        valOffset = 0;
      let minLen = 0,
        minOffset = 0;
      let maxLen = 0,
        maxOffset = 0;

      if (hasValue) {
        valLen = this.buffer[cursor++];
        valOffset = cursor;
        cursor += valLen * 2;
      }
      if (hasMin) {
        minLen = this.buffer[cursor++];
        minOffset = cursor;
        cursor += minLen * 2;
      }
      if (hasMax) {
        maxLen = this.buffer[cursor++];
        maxOffset = cursor;
        cursor += maxLen * 2;
      }

      // Check if address is exhausted before fulfilling rule constraints
      if (addrIdx >= addressNumbers.length) {
        if (hasMin && this.compareInt16PayloadWithZero(minOffset, minLen) < 0) {
          return false;
        }
        return true;
      }

      // Handle fixed value path
      if (hasValue) {
        const compareLen = Math.min(valLen, addressNumbers.length - addrIdx);
        for (let i = 0; i < compareLen; i++) {
          const val = this.view.getInt16(valOffset + i * 2, true);
          if (addressNumbers[addrIdx + i] !== val) {
            return false;
          }
        }

        addrIdx += valLen;

        // Main house number rule without sub_all constraint does NOT cover extra sub-numbers
        if (
          unit === 1 /* 號 */ &&
          subMode !== 2 /* sub_all */ &&
          addrIdx < addressNumbers.length &&
          r === rulesCount - 1
        ) {
          return false;
        }

        continue;
      }

      // Handle condition nodes (Min / Max / Parity)
      const targetLen = this.getConditionLengthBinary(hasMin ? minLen : 0, hasMax ? maxLen : 0, parity);

      if (targetLen > 0) {
        const availableLen = Math.min(targetLen, addressNumbers.length - addrIdx);

        // Check parity
        if (parity > 0) {
          const numToCheck = addressNumbers[addrIdx + availableLen - 1];
          const isOdd = numToCheck % 2 !== 0;
          if (parity === 1 && !isOdd) return false;
          if (parity === 2 && isOdd) return false;
        }

        // Check min value
        if (hasMin && this.compareArrayWithInt16Payload(addressNumbers, addrIdx, availableLen, minOffset, minLen) < 0) {
          return false;
        }

        // Check max value
        if (hasMax && this.compareArrayWithInt16Payload(addressNumbers, addrIdx, availableLen, maxOffset, maxLen) > 0) {
          return false;
        }

        addrIdx += availableLen;
      }
    }

    return true;
  }

  private compareInt16PayloadWithZero(minOffset: number, minLen: number): number {
    if (minLen === 0) return 0;
    const firstVal = this.view.getInt16(minOffset, true);
    if (0 !== firstVal) {
      return 0 - firstVal;
    }
    return 1 - minLen;
  }

  private compareArrayWithInt16Payload(
    arr: number[],
    arrStart: number,
    availableLen: number,
    bufOffset: number,
    payloadLen: number,
  ): number {
    const len = Math.min(availableLen, payloadLen);
    for (let i = 0; i < len; i++) {
      const bVal = this.view.getInt16(bufOffset + i * 2, true);
      const aVal = arr[arrStart + i];
      if (aVal !== bVal) {
        return aVal - bVal;
      }
    }
    return availableLen - payloadLen;
  }

  private getConditionLengthBinary(minLen: number, maxLen: number, parity: number): number {
    if (minLen === 0 && maxLen === 0 && parity === 0) return 0;
    let len = Math.max(minLen, maxLen);
    if (len === 0 && parity > 0) return 1;
    return len;
  }

  /**
   * Decode binary rules for an entry back into AddressRule[] (for formatting or debugging)
   */
  public decodeEntryRules(entryIndex: number): AddressRule[] {
    let cursor = this.getEntryRuleOffset(entryIndex);
    const rulesCount = this.buffer[cursor++];
    const rules: AddressRule[] = [];

    for (let r = 0; r < rulesCount; r++) {
      const ctrl1 = this.buffer[cursor++];
      const ctrl2 = this.buffer[cursor++];

      const hasValue = (ctrl1 & 0x01) !== 0;
      const hasMin = (ctrl1 & 0x02) !== 0;
      const hasMax = (ctrl1 & 0x04) !== 0;
      const parity = (ctrl1 >> 3) & 0x03;
      const subMode = (ctrl1 >> 5) & 0x03;

      const unit = ctrl2 & 0x0f;
      const endUnit = (ctrl2 >> 4) & 0x0f;

      const rule: AddressRule = {};
      if (unit > 0) rule.unit = REVERSE_UNIT_MAP[unit];
      if (endUnit > 0) rule.endUnit = REVERSE_END_UNIT_MAP[endUnit];
      if (parity > 0) rule.parity = REVERSE_PARITY_MAP[parity];
      if (subMode > 0) rule.subMode = REVERSE_SUB_MODE_MAP[subMode];

      if (hasValue) {
        const valLen = this.buffer[cursor++];
        const vals: number[] = [];
        for (let i = 0; i < valLen; i++) {
          vals.push(this.view.getInt16(cursor, true));
          cursor += 2;
        }
        rule.value = vals;
      }

      if (hasMin) {
        const minLen = this.buffer[cursor++];
        const mins: number[] = [];
        for (let i = 0; i < minLen; i++) {
          mins.push(this.view.getInt16(cursor, true));
          cursor += 2;
        }
        rule.min = mins;
      }

      if (hasMax) {
        const maxLen = this.buffer[cursor++];
        const maxs: number[] = [];
        for (let i = 0; i < maxLen; i++) {
          maxs.push(this.view.getInt16(cursor, true));
          cursor += 2;
        }
        rule.max = maxs;
      }

      rules.push(rule);
    }
    return rules;
  }

  /**
   * Helper to decode entry to Part2Entry object (for backward compatibility when needed)
   */
  public getEntry(entryIndex: number): Part2Entry {
    const part1Index = this.view.getUint16(this.indexTableOffset + entryIndex * 10, true);
    const zId = this.getEntryZipcodeId(entryIndex);
    const bId = this.getEntryBulkNameId(entryIndex);
    const zipcode = this.getZipcode(zId);
    const bulkName = this.getBulkName(bId);
    const rules = this.decodeEntryRules(entryIndex);

    return {
      id: entryIndex,
      part1Index,
      zipcode,
      bulkName,
      rules,
      range: formatAddressRule(rules),
    };
  }
}
