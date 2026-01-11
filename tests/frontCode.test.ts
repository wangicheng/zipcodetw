import { describe, expect, it } from 'bun:test';
import { decodeFrontCode, encodeFrontCode } from '../src/utils/frontCode';

describe('Front Code Utility', () => {
  describe('encodeFrontCode', () => {
    it('should encode a sorted list of strings', () => {
      const input = [
        '基隆市七堵區光明路',
        '基隆市七堵區實踐路',
      ];
      // "基隆市七堵區" is 6 chars long
      const expected = '0\t基隆市七堵區光明路\n6\t實踐路';
      expect(encodeFrontCode(input)).toBe(expected);
    });

    it('should encode simple alphanumeric strings', () => {
      const input = ['A', 'AB', 'AC', 'B'];
      const expected = '0\tA\n1\tB\n1\tC\n0\tB';
      expect(encodeFrontCode(input)).toBe(expected);
    });

    it('should handle empty list', () => {
      expect(encodeFrontCode([])).toBe('');
    });
  });

  describe('decodeFrontCode', () => {
    it('should decode front coded content', () => {
      const fcContent = '0\t基隆市七堵區光明路\n6\t實踐路';
      const expected = '基隆市七堵區光明路\n基隆市七堵區實踐路';
      expect(decodeFrontCode(fcContent)).toBe(expected);
    });

    it('should decode simple alphanumeric strings', () => {
      const fcContent = '0\tA\n1\tB\n1\tC\n0\tB';
      const expected = 'A\nAB\nAC\nB';
      expect(decodeFrontCode(fcContent)).toBe(expected);
    });

    it('should handle round trip', () => {
      const input = [
        '臺北市信義區市府路',
        '臺北市信義區松壽路',
        '臺北市大安區忠孝東路',
      ];
      const encoded = encodeFrontCode(input);
      const decoded = decodeFrontCode(encoded);
      expect(decoded).toBe(input.join('\n'));
    });
  });
});
