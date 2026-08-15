import type { BinaryPrefixSearchEngine } from './BinaryPrefixSearchEngine.ts';
import { BinaryRuleStore } from './BinaryRuleStore.ts';
import { formatAddressRule } from './formatRule.ts';
import type { AddressNormalizer } from './normalizer/AddressNormalizer.ts';
import { DefaultAddressNormalizer } from './normalizer/AddressNormalizer.ts';
import type { AddressRanker } from './ranker/AddressRanker.ts';
import { PostalDeliveryRanker } from './ranker/AddressRanker.ts';
import type { Part2Entry, SearchMatch } from './types.ts';

export class AddressQueryService {
  private engine: BinaryPrefixSearchEngine;
  private binaryStore: BinaryRuleStore;
  private normalizer: AddressNormalizer;
  private ranker: AddressRanker;

  constructor(
    engine: BinaryPrefixSearchEngine,
    binaryRules: BinaryRuleStore | ArrayBuffer | Uint8Array,
    normalizer: AddressNormalizer = new DefaultAddressNormalizer(),
    ranker: AddressRanker = new PostalDeliveryRanker(),
  ) {
    this.engine = engine;
    this.normalizer = normalizer;
    this.ranker = ranker;

    if (binaryRules instanceof BinaryRuleStore) {
      this.binaryStore = binaryRules;
    } else {
      this.binaryStore = new BinaryRuleStore(binaryRules);
    }
  }

  public getDataVersion(): string {
    return this.binaryStore.getDataVersion();
  }

  public search(searchInput: string, threshold: number = 1000): SearchMatch[] {
    const normalizedInput = this.normalizer.normalize(searchInput);
    const allMatches: SearchMatch[] = [];
    const matchedEntriesSet = new Set<number>();

    for (let splitIndex = normalizedInput.length; splitIndex >= 1; splitIndex--) {
      const part1 = normalizedInput.slice(0, splitIndex);
      const part2 = normalizedInput.slice(splitIndex);

      if (!/^[0-9一二三四五六七八九十上下之以全及含單地巷弄樓至號連附雙 ]*$/.test(part2)) break;

      const lastChar = part1.slice(-1);
      const nextChar = part2.slice(0, 1);
      const isDigit = (c: string) => /\d/.test(c);
      const isChiNum = (c: string) => /[一二三四五六七八九十]/.test(c);

      if (!(part2 === '' || (!isDigit(lastChar) && isDigit(nextChar)) || (!isChiNum(lastChar) && isChiNum(nextChar))))
        continue;

      const part1Converted = this.normalizer.convertPart1(part1);
      const part2Converted = this.normalizer.convertPart2(part2);

      const matches = this.engine.search(part1Converted);
      const part2Numbers = part2Converted.match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];

      for (const match of matches) {
        const splitMatches: SearchMatch[] = [];
        const entryIndices = this.binaryStore.searchEntriesByPart1(match.index);

        for (const entryIdx of entryIndices) {
          if (matchedEntriesSet.has(entryIdx)) continue;

          if (this.binaryStore.matchAddressBinary(part2Numbers, entryIdx)) {
            const decodedRules = this.binaryStore.decodeEntryRules(entryIdx);
            const ruleCount = decodedRules.length;
            const rangeSize = this.calculateRangeSize(decodedRules);
            const zipcode = this.binaryStore.getZipcode(this.binaryStore.getEntryZipcodeId(entryIdx));
            const bulkName = this.binaryStore.getBulkName(this.binaryStore.getEntryBulkNameId(entryIdx));
            const range = formatAddressRule(decodedRules);

            matchedEntriesSet.add(entryIdx);
            splitMatches.push({
              part1: match.text,
              part2: range,
              part2Numbers,
              bulkName: bulkName || '',
              zipcode,
              zipcode3: zipcode.slice(0, 3),
              ruleCount,
              rangeSize,
            });
          }
        }

        this.ranker.rank(splitMatches);

        if (splitIndex === normalizedInput.length) {
          splitMatches.reverse();
        }

        allMatches.push(...splitMatches);
      }

      if (allMatches.length >= threshold) {
        return allMatches.slice(0, threshold);
      }
    }
    return allMatches;
  }

  private calculateRangeSize(rules: Part2Entry['rules']): number {
    let size = 0,
      scale = 1;
    for (const rule of rules) {
      if (rule.value && rule.value.length > 0) {
        for (let i = 0; i < rule.value.length; i++) {
          size += scale;
          scale /= 10000;
        }
      } else if (rule.min?.length > 0 || rule.max?.length > 0) {
        const min = rule.min?.length > 0 ? rule.min[0] : 1;
        const max = rule.max?.length > 0 ? rule.max[0] : 5000;
        const diff = (max - min) / (rule.parity ? 2 : 1) + 1;
        size += (diff > 0 ? diff : 1) * scale;
        scale /= 10000;
      }
    }
    return size;
  }
}
