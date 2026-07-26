import { describe, expect, test } from 'bun:test';
import { DefaultAddressNormalizer } from '../src/core/normalizer/AddressNormalizer.ts';

describe('DefaultAddressNormalizer Unit Tests', () => {
  const normalizer = new DefaultAddressNormalizer();

  test('should normalize full-width numbers, dash, and 台 to 臺', () => {
    // 台北市 - 大安區 １０１號 -> 臺北市 之 大安區 101號
    const input = '台北市-大安區１０１號';
    const normalized = normalizer.normalize(input);
    expect(normalized).toBe('臺北市之大安區101號');
  });

  test('convertPart1 should convert digits to Chinese numerals', () => {
    // 3段 -> 三段
    expect(normalizer.convertPart1('和平東路3段')).toBe('和平東路三段');
    // 10段 -> 十段
    expect(normalizer.convertPart1('和平東路10段')).toBe('和平東路十段');
    // 21段 -> 二十一段
    expect(normalizer.convertPart1('和平東路21段')).toBe('和平東路二十一段');
  });

  test('convertPart2 should convert Chinese numerals to digits', () => {
    // 一號 ->  1 號
    expect(normalizer.convertPart2('一號')).toBe('1 號');
    // 十五號 ->  15 號
    expect(normalizer.convertPart2('十五號')).toBe('15 號');
  });
});
