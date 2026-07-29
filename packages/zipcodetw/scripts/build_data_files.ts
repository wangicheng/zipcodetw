import fs from 'node:fs/promises';
import { ADDRESS_PREFIXES_PATH, RAW_ADDRESSES_PATH, ZIPCODE_RULES_PATH } from '../src/core/constants.ts';
import type { AddressRule, RawAddress } from '../src/core/types.ts';
import { encodeFrontCode } from '../src/utils/frontCode.ts';
import { parseAddress } from '../scripts/utils/parseRule.ts';

async function main() {
  console.time('Build Data Files');
  // Read raw data
  console.log('Reading raw data...');
  const data: RawAddress[] = JSON.parse(await fs.readFile(RAW_ADDRESSES_PATH, 'utf-8'));

  // Group data so same part1 appear together (O(N) instead of sort O(N log N))
  const grouped = new Map<string, RawAddress[]>();
  for (const addr of data) {
    const key = [addr.city, addr.district, addr.road, addr.section !== '0' ? addr.section : ''].join('');

    const list = grouped.get(key);
    if (list) {
      list.push(addr);
    } else {
      grouped.set(key, [addr]);
    }
  }

  // Flatten back to array
  const sortedData: RawAddress[] = [];
  for (const group of grouped.values()) {
    for (const item of group) {
      sortedData.push(item);
    }
  }

  // Join into a large string (part1)
  const addressStrings = sortedData.map((addr) => {
    return [addr.city, addr.district, addr.road, addr.section !== '0' ? addr.section : ''].join('').trim();
  });

  const part1List = Array.from(new Set(addressStrings.filter(Boolean)));

  // Generate Address Prefixes (FC)
  console.log('Generating Address Prefixes (Front Coding)...');
  const fcContent = encodeFrontCode(part1List);
  await fs.writeFile(ADDRESS_PREFIXES_PATH, fcContent, 'utf-8');
  console.log(`檔案已產生：${ADDRESS_PREFIXES_PATH}`);

  // Build index map
  const addressToIndex = new Map(part1List.map((addr, i) => [addr, i]));

  // Process part2
  const part2Data = sortedData.map((addr, i) => {
    const addrStr = addressStrings[i];
    const part1Index = addressToIndex.get(addrStr) ?? -1;

    // Parse range string
    let Rules: AddressRule[] = [];
    try {
      Rules = parseAddress(addr.range.replaceAll(' ', ''));
    } catch (e) {
      console.warn(`Failed to parse range for "${addrStr}": ${addr.range}`, e);
    }

    return {
      id: i,
      part1Index,
      rules: Rules,
      range: addr.range.replaceAll(' ', ''),
      bulkName: addr.bulkName.replaceAll(' ', ''),
      zipcode: addr.zipcode.replaceAll(' ', ''),
    };
  });
  
  // Generate Zipcode Rules (JSON)
  console.log('Generating Zipcode Rules (JSON)...');
  const rawRulesContent = JSON.stringify(part2Data);
  await fs.writeFile(ZIPCODE_RULES_PATH, rawRulesContent, 'utf-8');
  console.log(`檔案已產生：${ZIPCODE_RULES_PATH}`);

  console.timeEnd('Build Data Files');
}

main().catch(console.error);
