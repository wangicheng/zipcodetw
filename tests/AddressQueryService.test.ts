import { beforeEach, describe, expect, test } from 'bun:test';
import { AddressQueryService } from '../src/core/AddressQueryService';
import { AddressSearchEngineOptimized } from '../src/core/AddressSearchEngine';
import type { Part2Entry } from '../src/core/types';

describe('AddressQueryService Unit Tests', () => {
  let mockEngine: AddressSearchEngineOptimized;
  let mockPart2Data: Part2Entry[];
  let service: AddressQueryService;

  beforeEach(() => {
    // Mock the engine. Since it's a class, we can just instantiate it with dummy data
    // or we could mock the prototype if needed.
    // For simplicity, we use a real instance with controlled small data.
    // NOTE: The service normalizes '台' to '臺', so our engine data must use '臺' to match.
    const part1Data = `臺北市大安區和平東路三段\n新北市板橋區文化路`;
    mockEngine = new AddressSearchEngineOptimized(part1Data);

    // Mock Part2 Data (Zipcode Rules)
    // Rule: Anything under 和平東路三段 gets zipcode 106
    mockPart2Data = [
      {
        id: 1,
        part1Index: 0, // 臺北市大安區和平東路三段 (Index 0 in engine)
        zipcode: '106',
        rules: [], // No extra rules means match all
        range: '全',
        bulkName: '',
      },
      {
        id: 2,
        part1Index: 1, // 新北市板橋區文化路 (Index 1 in engine)
        zipcode: '220',
        rules: [{ value: [1] }], // Address 1 only
        range: '1號',
        bulkName: '',
      },
    ];

    service = new AddressQueryService(mockEngine, mockPart2Data);
  });

  test('should normalize chinese numerals in part1', () => {
    // "臺" -> "台", "３" -> "3"
    // Input: 臺北市大安區和平東路３段
    // Should match index 0
    const matches = service.search('臺北市大安區和平東路３段');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('106');
  });

  test('should parse chinese numerals in part2', () => {
    // Input: 新北市板橋區文化路一號
    // "一號" -> 1
    const matches = service.search('新北市板橋區文化路一號');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('220');
    expect(matches[0].part2Numbers).toEqual([1]);
  });

  test('should handle arabic digits in part2', () => {
    // Input: 新北市板橋區文化路1號
    const matches = service.search('新北市板橋區文化路1號');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode).toBe('220');
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
    expect(matches[0].zipcode).toBe('106');
  });
});
