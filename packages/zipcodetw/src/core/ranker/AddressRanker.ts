import type { SearchMatch } from '../types.ts';

export interface AddressRanker {
  /**
   * Sort array of search matches according to ranking rules
   */
  rank(matches: SearchMatch[]): SearchMatch[];
}

export class PostalDeliveryRanker implements AddressRanker {
  public rank(matches: SearchMatch[]): SearchMatch[] {
    return matches.sort((a, b) => {
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
}
