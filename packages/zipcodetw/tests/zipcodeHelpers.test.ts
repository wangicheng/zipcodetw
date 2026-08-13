import { describe, expect, test } from 'bun:test';

import { ZipCodeTw, normalizeCityName, parseCityDistrict } from '../src/index.ts';
import { createZipCodeTw } from '../src/node.ts';

describe('ZipCodeTw Core Helpers Tests', () => {
  test('ZipCodeTw.getCities returns list of Taiwan cities', () => {
    const cities = ZipCodeTw.getCities();
    expect(cities).toContain('臺北市');
    expect(cities).toContain('高雄市');
    expect(cities.length).toBeGreaterThan(15);
  });

  test('ZipCodeTw.getDistricts handles exact and alias city names', () => {
    const d1 = ZipCodeTw.getDistricts('臺北市');
    expect(d1).toContain('大安區');

    const d2 = ZipCodeTw.getDistricts('台北');
    expect(d2).toContain('大安區');

    const d3 = ZipCodeTw.getDistricts('台中');
    expect(d3).toContain('西屯區');
  });

  test('normalizeCityName correctly normalizes common city aliases', () => {
    expect(normalizeCityName('台北')).toBe('臺北市');
    expect(normalizeCityName('台中')).toBe('臺中市');
    expect(normalizeCityName('台南')).toBe('臺南市');
    expect(normalizeCityName('高雄')).toBe('高雄市');
  });

  test('parseCityDistrict parses city, district and remaining detail string', () => {
    const parsed = parseCityDistrict('台北市大安區和平東路三段1號');
    expect(parsed.city).toBe('臺北市');
    expect(parsed.district).toBe('大安區');
    expect(parsed.detail).toBe('和平東路三段1號');
  });

  test('ZipCodeTw search matches include both zipcode and zipcode3', async () => {
    const zipCodeTw = await createZipCodeTw();
    const matches = zipCodeTw.search('臺北市大安區和平東路三段1號');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].zipcode3).toBe('106');
    expect(matches[0].zipcode.startsWith('106')).toBe(true);
  });
});
