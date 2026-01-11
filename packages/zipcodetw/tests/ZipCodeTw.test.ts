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
