import { matchAddress } from './AddressMatcher.ts';
import type { AddressSearchEngineOptimized } from './AddressSearchEngine.ts';
import type { AddressNormalizer } from './normalizer/AddressNormalizer.ts';
import { DefaultAddressNormalizer } from './normalizer/AddressNormalizer.ts';
import type { AddressRanker } from './ranker/AddressRanker.ts';
import { PostalDeliveryRanker } from './ranker/AddressRanker.ts';
import type { Part2Entry, SearchMatch } from './types.ts';

export class AddressQueryService {
  private engine: AddressSearchEngineOptimized;
  private part2Data: Part2Entry[];
  private normalizer: AddressNormalizer;
  private ranker: AddressRanker;

  constructor(
    engine: AddressSearchEngineOptimized,
    part2Data: Part2Entry[],
    normalizer: AddressNormalizer = new DefaultAddressNormalizer(),
    ranker: AddressRanker = new PostalDeliveryRanker()
  ) {
    this.engine = engine;
    this.part2Data = part2Data;
    this.normalizer = normalizer;
    this.ranker = ranker;
  }

  public search(searchInput: string, threshold: number = 1000): SearchMatch[] {
    const normalizedInput = this.normalizer.normalize(searchInput);
    const allMatches: SearchMatch[] = [];
    const matchedEntries = new Set<number>();

    for (let splitIndex = normalizedInput.length; splitIndex >= 1; splitIndex--) {
      const part1 = normalizedInput.slice(0, splitIndex);
      const part2 = normalizedInput.slice(splitIndex);

      if (!/^[0-9一二三四五六七八九十上下之以全及含單地巷弄樓至號連附雙 ]*$/.test(part2)) break;

      const lastChar = part1.slice(-1);
      const nextChar = part2.slice(0, 1);
      const isDigit = (c: string) => /\d/.test(c);
      const isChiNum = (c: string) => /[一二三四五六七八九十]/.test(c);

      if (!(part2 === '' || (!isDigit(lastChar) && isDigit(nextChar)) || (!isChiNum(lastChar) && isChiNum(nextChar)))) continue;

      const part1Converted = this.normalizer.convertPart1(part1);
      const part2Converted = this.normalizer.convertPart2(part2);

      const matches = this.engine.search(part1Converted);

      const part2Numbers = part2Converted.match(/\d+/g)?.map((n) => parseInt(n, 10)) || [];

      for (const match of matches) {
        const splitMatches: SearchMatch[] = [];

        const relevantEntries = this.getRelatedEntries(match.index);

        for (const entry of relevantEntries) {
          if (matchedEntries.has(entry.id)) continue;

          if (matchAddress(part2Numbers, entry.rules)) {
            const ruleCount = entry.rules.length;
            const rangeSize = this.calculateRangeSize(entry.rules);

            matchedEntries.add(entry.id);
            splitMatches.push({
              part1: match.text,
              part2: entry.range,
              part2Numbers,
              bulkName: entry.bulkName,
              zipcode: entry.zipcode,
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

  private getRelatedEntries(part1Index: number): Part2Entry[] {
    let left = 0,
      right = this.part2Data.length - 1;
    while (left <= right) {
      const mid = (left + right) >>> 1;
      if (this.part2Data[mid].part1Index < part1Index) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (left >= this.part2Data.length || this.part2Data[left].part1Index !== part1Index) {
      return [];
    }

    const results: Part2Entry[] = [];
    for (let i = left; i < this.part2Data.length; i++) {
      if (this.part2Data[i].part1Index === part1Index) {
        results.push(this.part2Data[i]);
      } else {
        break;
      }
    }
    return results;
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
