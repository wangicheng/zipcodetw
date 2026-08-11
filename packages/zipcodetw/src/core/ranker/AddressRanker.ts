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
      // 2. Smaller Range First (Exact match has smaller rangeSize)
      const rsA = a.rangeSize ?? Number.MAX_VALUE;
      const rsB = b.rangeSize ?? Number.MAX_VALUE;
      if (rsA !== rsB) {
        return rsA - rsB;
      }
      // 3. More rules (deeper specificity) First
      const rcA = a.ruleCount ?? 0;
      const rcB = b.ruleCount ?? 0;
      return rcB - rcA;
    });
  }
}
