import { beforeEach, describe, expect, test } from 'bun:test';
import { AddressQueryService } from '../src/core/AddressQueryService';
import { BinaryPrefixSearchEngine } from '../src/core/BinaryPrefixSearchEngine';
import { BinaryRuleStore } from '../src/core/BinaryRuleStore';
import { buildBinaryPrefixes, buildBinaryRules } from '../scripts/utils/binaryEncoders';
import type { Part2Entry } from '../src/core/types';

describe('AddressQueryService Unit Tests', () => {
  let service: AddressQueryService;

  beforeEach(() => {
    const part1List = ['臺北市大安區和平東路三段', '新北市板橋區文化路'];
    const binPrefixBuf = buildBinaryPrefixes(part1List);
    const mockEngine = new BinaryPrefixSearchEngine(binPrefixBuf);

    const mockPart2Data: Part2Entry[] = [
      {
        id: 1,
        part1Index: 0,
        zipcode: '106001',
        rules: [],
        range: '全',
        bulkName: '',
      },
      {
        id: 2,
        part1Index: 1,
        zipcode: '220001',
        rules: [{ value: [1] }],
        range: '1號',
        bulkName: '',
      },
    ];

    const binRulesBuf = buildBinaryRules(mockPart2Data);
    const mockStore = new BinaryRuleStore(binRulesBuf);

    service = new AddressQueryService(mockEngine, mockStore);
  });

  test('should normalize chinese numerals in part1', () => {
    // "臺" -> "台", "３" -> "3"
    // Input: 臺北市大安區和平東路３段
    // Should match index 0
    const matches = service.search('臺北市大安區和平東路３段');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('106001');
  });

  test('should parse chinese numerals in part2', () => {
    // Input: 新北市板橋區文化路一號
    // "一號" -> 1
    const matches = service.search('新北市板橋區文化路一號');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('220001');
    expect(matches[0].part2Numbers).toEqual([1]);
  });

  test('should handle arabic digits in part2', () => {
    // Input: 新北市板橋區文化路1號
    const matches = service.search('新北市板橋區文化路1號');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('220001');
    expect(matches[0].part2Numbers).toEqual([1]);
  });

  test('should return empty if part2 does not match rules', () => {
    // Input: 新北市板橋區文化路2號 (Rule only allows 1)
    const matches = service.search('新北市板橋區文化路2號');
    // Depending on logic, it might return empty or return matches with lower confidence?
    // Based on implementation: "if (matchAddress(...))" -> so it should be empty
    expect(matches.length).toBe(0);
  });

  test('should handle part1 part2 split correctly', () => {
    // "台北市大安區和平東路三段" splits into part1="台北市大安區和平東路三段", part2=""
    const matches = service.search('台北市大安區和平東路三段');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('106001');
  });
});
