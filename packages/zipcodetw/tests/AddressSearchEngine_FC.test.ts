import { describe, expect, it } from 'bun:test';
import { AddressSearchEngineOptimized } from '../src/core/AddressSearchEngine';
import { decodeFrontCode } from '../src/utils/frontCode';

describe('AddressSearchEngineOptimized with FC', () => {
  it('should handle raw content', () => {
    const content = '基隆市七堵區光明路\n基隆市七堵區實踐路';
    const engine = new AddressSearchEngineOptimized(content);
    const result = engine.search('七堵');
    expect(result.length).toBe(2);
    expect(result[0].text).toBe('基隆市七堵區光明路');
    expect(result[1].text).toBe('基隆市七堵區實踐路');
  });

  it('should handle front coded content via decoder', () => {
    // 0\t基隆市七堵區光明路
    // 6\t實踐路
    const fcContent = '0\t基隆市七堵區光明路\n6\t實踐路';
    const decoded = decodeFrontCode(fcContent);
    const engine = new AddressSearchEngineOptimized(decoded);

    const result = engine.search('七堵');
    expect(result.length).toBe(2);
    expect(result[0].text).toBe('基隆市七堵區光明路');
    expect(result[1].text).toBe('基隆市七堵區實踐路');
  });

  it('should handle complex front coded content via decoder', () => {
    // Raw:
    // A
    // AB
    // AC
    // B

    // FC:
    // 0\tA
    // 1\tB
    // 1\tC
    // 0\tB

    const content = '0\tA\n1\tB\n1\tC\n0\tB';
    const decoded = decodeFrontCode(content);
    const engine = new AddressSearchEngineOptimized(decoded);

    // Check internal addresses if possible, or search
    const resultA = engine.search('A');
    expect(resultA.some((r) => r.text === 'A')).toBe(true);
    expect(resultA.some((r) => r.text === 'AB')).toBe(true);
    expect(resultA.some((r) => r.text === 'AC')).toBe(true);

    const resultB = engine.search('B');
    expect(resultB.some((r) => r.text === 'AB')).toBe(true);
    expect(resultB.some((r) => r.text === 'B')).toBe(true);
  });
});
