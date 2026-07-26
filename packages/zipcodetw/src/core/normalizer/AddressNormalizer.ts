export interface AddressNormalizer {
  /**
   * Perform initial text normalization on raw address search input
   */
  normalize(input: string): string;

  /**
   * Convert Part 1 (prefix) text numbers/characters before searching the index
   */
  convertPart1(part1: string): string;

  /**
   * Convert Part 2 (suffix) text numbers/characters before rule matching
   */
  convertPart2(part2: string): string;
}

export class DefaultAddressNormalizer implements AddressNormalizer {
  private static readonly REPLACEMENT_MAP: Record<string, string> = {
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

  public normalize(input: string): string {
    return input.replace(/[-~台○０-９]/g, (m) => DefaultAddressNormalizer.REPLACEMENT_MAP[m] || m);
  }

  public convertPart1(part1: string): string {
    return part1
      .replace(/\d+/g, (match) => {
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
      })
      .trim();
  }

  public convertPart2(part2: string): string {
    return part2
      .replace(/[一二三四五六七八九十]+/g, (match) => {
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
      })
      .trim();
  }
}
