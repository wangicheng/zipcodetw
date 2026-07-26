import { describe, expect, test } from 'bun:test';
import { TAIWAN_DISTRICTS, normalizeCityName } from '../src/widget/taiwanDistricts.ts';
import { createZipCodeTw } from '../src/node.ts';

describe('Widget Taiwan Districts & Helpers', () => {
  test('TAIWAN_DISTRICTS contains 22 counties', () => {
    const cities = Object.keys(TAIWAN_DISTRICTS);
    expect(cities.length).toBe(22);
    expect(cities).toContain('臺北市');
    expect(cities).toContain('新北市');
    expect(cities).toContain('高雄市');
    expect(cities).toContain('花蓮縣');
    expect(TAIWAN_DISTRICTS['臺北市']).toContain('大安區');
  });

  test('normalizeCityName handles common aliases', () => {
    expect(normalizeCityName('台北市')).toBe('臺北市');
    expect(normalizeCityName('台中市')).toBe('臺中市');
    expect(normalizeCityName('台南市')).toBe('臺南市');
    expect(normalizeCityName('高雄')).toBe('高雄市');
  });

  test('ZipCodeTw engine returns 6-digit zipcode for complete addresses', async () => {
    const zipEngine = await createZipCodeTw();
    const results = zipEngine.search('臺北市大安區和平東路三段100號');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].zipcode).toHaveLength(6);
    expect(results[0].zipcode.startsWith('106')).toBe(true);
  });
});
