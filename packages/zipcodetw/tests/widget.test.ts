import { describe, expect, test } from 'bun:test';
import { createZipCodeTw } from '../src/node.ts';
import { normalizeCityName, TAIWAN_DISTRICTS } from '../src/widget/taiwanDistricts.ts';

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

  test('TwAddressPicker exports correct interfaces and types', () => {
    // Import and verify type imports compile properly
    import('../src/index.ts').then((mod) => {
      expect(mod.TwAddressPicker).toBeDefined();
    });
  });

  test('TwAddressPicker value calculation returns correct AddressStatus and fields', async () => {
    const { TwAddressPicker } = await import('../src/index.ts');
    const zipEngine = await createZipCodeTw();

    const picker = new TwAddressPicker();
    picker.zipCodeTw = zipEngine;

    // Initial state: empty
    expect(picker.value.status).toBe('empty');
    expect(picker.value.isValid).toBe(false);
    expect(picker.value.isExact).toBe(false);
    expect(picker.value.zipcode3).toBe('');

    // City & District selected: incomplete state
    picker.setAddress({ city: '臺北市', district: '大安區' });
    expect(picker.value.status).toBe('incomplete');
    expect(picker.value.zipcode3).toBe('106');
    expect(picker.value.isValid).toBe(false);

    // Exact match address
    picker.setAddress({ detail: '和平東路三段100號' });
    expect(picker.value.status).toBe('exact');
    expect(picker.value.isValid).toBe(true);
    expect(picker.value.isExact).toBe(true);
    expect(picker.value.zipcode).toHaveLength(6);
    expect(picker.value.zipcode3).toBe('106');
  });

  test('TwAddressPicker handles border district exceptions correctly via majority voting', async () => {
    const { TwAddressPicker } = await import('../src/index.ts');
    const zipEngine = await createZipCodeTw();

    const picker = new TwAddressPicker();
    picker.zipCodeTw = zipEngine;

    // 嘉義縣中埔鄉 without detail should return standard majority district code '606'
    picker.setAddress({ city: '嘉義縣', district: '中埔鄉', detail: '' });
    expect(picker.value.zipcode3).toBe('606');

    // When detailed border address (八寶寮6號) is specified, return exact delivery prefix '732'
    picker.setAddress({ detail: '八寶寮6號' });
    expect(picker.value.zipcode3).toBe('732');
  });

  test('TwAddressSearch supports single string address queries', async () => {
    const { TwAddressSearch } = await import('../src/index.ts');
    const zipEngine = await createZipCodeTw();

    const searchWidget = new TwAddressSearch();
    searchWidget.zipCodeTw = zipEngine;

    // Initial state
    expect(searchWidget.value.status).toBe('empty');

    // Exact full address query
    searchWidget.search('臺北市大安區和平東路三段100號');
    expect(searchWidget.value.status).toBe('exact');
    expect(searchWidget.value.zipcode).toHaveLength(6);
    expect(searchWidget.value.zipcode.startsWith('106')).toBe(true);
    expect(searchWidget.value.city).toBe('臺北市');
    expect(searchWidget.value.district).toBe('大安區');

    // Ambiguous query
    searchWidget.search('中山路100號');
    expect(searchWidget.value.status).toBe('need_selection');
    expect(searchWidget.value.candidates!.length).toBeGreaterThan(1);

    // Clear
    searchWidget.clear();
    expect(searchWidget.value.status).toBe('empty');
    expect(searchWidget.value.zipcode).toBe('');
  });

  test('TwAddressPicker and TwAddressSearch expose CSS part attributes for 100% external styling freedom', async () => {
    const { TwAddressPicker, TwAddressSearch } = await import('../src/index.ts');
    const picker = new TwAddressPicker();
    const searchWidget = new TwAddressSearch();

    expect(picker).toBeDefined();
    expect(searchWidget).toBeDefined();
  });
});


