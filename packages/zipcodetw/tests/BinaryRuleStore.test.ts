import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

import { BinaryRuleStore } from '../src/core/BinaryRuleStore.ts';
import { ZIPCODE_RULES_PATH } from '../src/core/constants.ts';
import { createZipCodeTw } from '../src/node.ts';

describe('BinaryRuleStore & ZipCodeTw Binary Engine Tests', () => {
  test('BinaryRuleStore correctly initializes from binary buffer', () => {
    const binBuffer = fs.readFileSync(path.resolve(import.meta.dirname, '../', ZIPCODE_RULES_PATH));
    const store = new BinaryRuleStore(binBuffer);

    expect(store.entryCount).toBeGreaterThan(70000);

    const entry0 = store.getEntry(0);
    expect(entry0.part1Index).toBeDefined();
    expect(entry0.zipcode).toBeDefined();

    const matchedIdx = store.searchEntriesByPart1(1);
    expect(matchedIdx.length).toBeGreaterThan(0);
  });

  test('ZipCodeTw.create binary search produces valid zipcode results', async () => {
    const zipCodeTw = await createZipCodeTw();

    const queries = [
      '臺北市大安區和平東路三段1巷40號',
      '新北市板橋區中山路一段181號',
      '臺中市西屯區台灣大道三段99號',
      '高雄市苓雅區四維三路2號',
      '新竹市東區力行路1號',
    ];

    for (const q of queries) {
      const results = zipCodeTw.search(q);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].zipcode).toBeDefined();
      expect(results[0].zipcode.length).toBe(6);
    }
  });
});
