import { expect, test } from 'bun:test';
import { createZipCodeTw } from '../src/node.ts';

test('ZipCodeTw High-Level Interface', async () => {
  // Initialize the unified service
  // This handles loading data files internally via the node-specific helper
  const zipCodeTw = await createZipCodeTw();

  const searchInput = '台北大安和平東路三段１巷４０號';
  const matches = zipCodeTw.search(searchInput);

  expect(matches.length).toBeGreaterThan(0);

  // Check first match structure
  const match = matches[0];
  expect(match.zipcode).toBeDefined();
  expect(match.part1).toBeDefined();
  // Expect 3+2 or full 6 digit zip code depending on data
  expect(match.zipcode).toMatch(/^106/);

  console.log(`Found ${matches.length} matches via ZipCodeTw interface`);
});

test('Should correctly match 屏東縣屏東市貴陽街2號 to exact main number rule 2號 (900009)', async () => {
  const zipCodeTw = await createZipCodeTw();

  // Test main number 2號
  const matches2 = zipCodeTw.search('屏東縣屏東市貴陽街2號');
  expect(matches2.length).toBeGreaterThan(0);
  expect(matches2[0].zipcode).toBe('900009');
  expect(matches2[0].part2).toBe('2號');

  // Test sub number 2之1號
  const matches2sub = zipCodeTw.search('屏東縣屏東市貴陽街2之1號');
  expect(matches2sub.length).toBeGreaterThan(0);
  expect(matches2sub[0].zipcode).toBe('900012');
  expect(matches2sub[0].part2).toBe('2之1號至之4號');
});
