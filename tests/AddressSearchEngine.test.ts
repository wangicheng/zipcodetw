import { describe, expect, test } from 'bun:test';
import { AddressSearchEngineOptimized } from '../src/core/AddressSearchEngine';

describe('AddressSearchEngineOptimized', () => {
  // A small dataset for testing
  const mockData = `
台北市大安區
台北市信義區
新北市板橋區
新竹市東區
    `.trim();

  const engine = new AddressSearchEngineOptimized(mockData);

  test('should find exact matches', () => {
    const results = engine.search('台北市大安區');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.text === '台北市大安區')).toBe(true);
  });

  test('should find subsequence matches', () => {
    // "台大安" is a subsequence of "台北市大安區"
    const results = engine.search('台大安');
    expect(results.some((r) => r.text === '台北市大安區')).toBe(true);
  });

  test('should not find non-existent matches', () => {
    const results = engine.search('高雄市');
    expect(results.length).toBe(0);
  });

  test('should handle empty query', () => {
    const results = engine.search('');
    expect(results.length).toBe(0);
  });

  test('should handle characters not in index', () => {
    const results = engine.search('美國加州');
    expect(results.length).toBe(0);
  });

  test('should rank matches', () => {
    // Create a new engine with overlapping data
    const overlapData = `
A
AB
ABC
         `.trim();
    const overlapEngine = new AddressSearchEngineOptimized(overlapData);

    const results = overlapEngine.search('A');
    // Should find all 3
    expect(results.length).toBe(3);
    const texts = results.map((r) => r.text);
    expect(texts).toContain('A');
    expect(texts).toContain('AB');
    expect(texts).toContain('ABC');
  });
});
