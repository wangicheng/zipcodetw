import { describe, expect, test } from 'bun:test';
import { PostalDeliveryRanker } from '../src/core/ranker/AddressRanker.ts';
import type { SearchMatch } from '../src/core/types.ts';

describe('PostalDeliveryRanker Unit Tests', () => {
  const ranker = new PostalDeliveryRanker();

  test('should sort longer prefix first', () => {
    const matches: SearchMatch[] = [
      { part1: '台北市', part2: '1號', part2Numbers: [1], bulkName: '', zipcode: '100' },
      { part1: '台北市大安區', part2: '1號', part2Numbers: [1], bulkName: '', zipcode: '106' },
    ];

    const ranked = ranker.rank(matches);
    expect(ranked[0].part1).toBe('台北市大安區');
  });

  test('should sort higher ruleCount when prefix length is equal', () => {
    const matches: SearchMatch[] = [
      { part1: '台北市大安區', part2: '1號', part2Numbers: [1], bulkName: '', zipcode: '106', ruleCount: 1 },
      { part1: '台北市大安區', part2: '1號', part2Numbers: [1], bulkName: '', zipcode: '106', ruleCount: 3 },
    ];

    const ranked = ranker.rank(matches);
    expect(ranked[0].ruleCount).toBe(3);
  });
});
