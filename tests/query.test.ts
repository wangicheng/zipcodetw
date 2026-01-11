import { test } from 'bun:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import { AddressQueryService } from '../src/core/AddressQueryService.ts';
import { AddressSearchEngineOptimized } from '../src/core/AddressSearchEngine.ts';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from '../src/core/constants.ts';
import type { Part2Entry } from '../src/core/types.ts';

test('AddressQueryService Integration Test', async () => {
  // Read part1.txt
  const part1Content = await fs.readFile(ADDRESS_PREFIXES_PATH, 'utf-8');
  const engine = new AddressSearchEngineOptimized(part1Content);

  // Read part2.json
  const part2Data: Part2Entry[] = JSON.parse(await fs.readFile(ZIPCODE_RULES_PATH, 'utf-8'));

  // Initialize query service
  const queryService = new AddressQueryService(engine, part2Data);

  // Set threshold
  const MATCH_THRESHOLD = 10;

  // Start search
  const searchInput = '台北大安和平東路三段１巷４０號';
  const startTime = performance.now();

  // Perform search using service
  const allMatches = queryService.search(searchInput, MATCH_THRESHOLD);

  // Calculate elapsed time
  const totalTime = performance.now() - startTime;

  // Print all matches
  console.log('\n========================================');
  console.log(`Query: ${searchInput}`);
  console.log(`Total matches found: ${allMatches.length}`);
  console.log(`First match Zipcode: ${allMatches[0]?.zipcode}`);
  console.log(`Total time elapsed: ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s)`);
  console.log('========================================\n');

  // Assertions
  assert.ok(allMatches.length > 0, `Should find matches for ${searchInput}`);

  const match = allMatches[0];
  assert.ok(match.zipcode, 'Match should have zipcode');
  assert.ok(match.part1, 'Match should have part1');
  assert.ok(Array.isArray(match.part2Numbers), 'part2Numbers should be generic array');
});
