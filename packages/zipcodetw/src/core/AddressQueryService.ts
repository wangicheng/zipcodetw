import { matchAddress } from './AddressMatcher.ts';
import type { AddressSearchEngineOptimized } from './AddressSearchEngine.ts';
import type { Part2Entry, SearchMatch } from './types.ts';

export class AddressQueryService {
  private engine: AddressSearchEngineOptimized;
  private part2Data: Part2Entry[];

  private static readonly PART1_MAP: Record<string, string> = {
    '-': '之',
    '~': '之',
    台: '臺',
    '○': '0',
    '０': '0',
    '１': '1',
    '２': '2',
    '３': '3',
    '４': '4',
    '５': '5',
    '６': '6',
    '７': '7',
    '８': '8',
    '９': '9',
  };

  constructor(engine: AddressSearchEngineOptimized, part2Data: Part2Entry[]) {
    this.engine = engine;
    this.part2Data = part2Data;
  }

  public search(searchInput: string, threshold: number = 1000): SearchMatch[] {
    const normalizedInput = searchInput.replace(/[-~台０-９]/g, (m) => AddressQueryService.PART1_MAP[m]);
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

      const part1Converted = this.convertPart1Digits(part1).trim();
      const part2Converted = this.convertPart2Digits(part2).trim();

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

        this.sortMatches(splitMatches);

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
        // Use the first element of min/max for size calculation as a heuristic
        const min = rule.min?.length > 0 ? rule.min[0] : 1;
        const max = rule.max?.length > 0 ? rule.max[0] : 5000;
        const diff = (max - min) / (rule.parity ? 2 : 1) + 1;
        size += (diff > 0 ? diff : 1) * scale;
        scale /= 10000; // Penalty for open/unknown ranges
      }
    }
    return size;
  }

  private sortMatches(matches: SearchMatch[]): void {
    // 這個函數沒有唯一的正確答案，可以根據需求調整排序邏輯
    matches.sort((a, b) => {
      // 1. Longest Prefix First
      if (a.part1.length !== b.part1.length) {
        return b.part1.length - a.part1.length;
      }
      // 2. More rules (deeper specificity) First
      const rcA = a.ruleCount ?? 0;
      const rcB = b.ruleCount ?? 0;
      if (rcA !== rcB) {
        return rcB - rcA;
      }
      // 3. Smaller Range First
      const rsA = a.rangeSize ?? Number.MAX_VALUE;
      const rsB = b.rangeSize ?? Number.MAX_VALUE;
      return rsA - rsB;
    });
  }

  private convertPart1Digits(text: string): string {
    return text.replace(/\d+/g, (match) => {
      const num = parseInt(match, 10);
      if (num >= 1 && num <= 99) {
        if (num === 10) return '十';
        const numMap = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (num < 10) return numMap[num];
        const tens = Math.floor(num / 10);
        const units = num % 10;
        const tensStr = tens === 1 ? '十' : `${numMap[tens]}十`;
        const unitsStr = units === 0 ? '' : numMap[units];
        return tensStr + unitsStr;
      }
      return match.replace(/[0-9]/g, (d) => '零一二三四五六七八九'[parseInt(d, 10)]);
    });
  }

  private convertPart2Digits(text: string): string {
    return text.replace(/[一二三四五六七八九十]+/g, (match) => {
      const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      let num = 0;
      if (match.length === 1) num = map[match] || 0;
      else if (match.startsWith('十')) num = 10 + (map[match[1]] || 0);
      else if (match.endsWith('十')) num = (map[match[0]] || 0) * 10;
      else if (match.includes('十')) {
        const parts = match.split('十');
        num = (map[parts[0]] || 0) * 10 + (map[parts[1]] || 0);
      } else {
        num = match
          .split('')
          .map((ch) => map[ch] || 0)
          .reduce((acc, v) => acc * 10 + v, 0);
      }
      return num === 0 ? match : ` ${num} `;
    });
  }
}
