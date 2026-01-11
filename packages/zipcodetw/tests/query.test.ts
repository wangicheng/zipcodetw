import { test } from 'bun:test';
import assert from 'node:assert';
import { createZipCodeTw } from '../src/node.ts';

test('ZipCodeTw Integration Test', async () => {
  // Initialize query service
  const zipCodeTw = await createZipCodeTw();

  // Set threshold
  const MATCH_THRESHOLD = 10;

  // Start search
  const searchInput = '台北大安和平東路三段１巷４０號';
  const startTime = performance.now();

  // Perform search using service
  const matches = zipCodeTw.search(searchInput, MATCH_THRESHOLD);

  // Calculate elapsed time
  const totalTime = performance.now() - startTime;

  // Print all matches
  console.log('\n========================================');
  console.log(`Query: ${searchInput}`);
  console.log(`Total matches found: ${matches.length}`);
  console.log(`First match Zipcode: ${matches[0]?.zipcode}`);
  console.log(`Total time elapsed: ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('========================================\n');

  // Assertions
  assert.ok(matches.length > 0, `Should find matches for ${searchInput}`);

  const match = matches[0];
  assert.ok(match.zipcode, 'Match should have zipcode');
  assert.ok(match.part1, 'Match should have part1');
  assert.ok(Array.isArray(match.part2Numbers), 'part2Numbers should be generic array');
});
