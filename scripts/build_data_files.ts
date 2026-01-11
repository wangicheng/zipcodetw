import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { ADDRESS_PREFIXES_PATH, RAW_ADDRESSES_PATH, ZIPCODE_RULES_PATH } from '../src/core/constants.ts';
import type { AddressRule, RawAddress } from '../src/core/types.ts';
import { encodeFrontCode } from '../src/utils/frontCode.ts';
import { parseAddress } from '../scripts/utils/parseRule.ts';

const gzip = promisify(zlib.gzip);

/**
 * Compress content using Gzip
 */
async function compressContent(content: string): Promise<Buffer> {
  return await gzip(Buffer.from(content, 'utf-8'), { level: 9 });
}

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

  // Generate Compressed Address Prefixes (FC + Gzip)
  console.log('Compressing Address Prefixes (FC + Gzip)...');
  const fcContent = encodeFrontCode(part1List);
  const compressedPrefixes = await compressContent(fcContent);
  await fs.writeFile(`${ADDRESS_PREFIXES_PATH}.gz`, compressedPrefixes);
  console.log(`GZ 檔案已產生：${ADDRESS_PREFIXES_PATH}.gz`);

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
  
  // Generate Compressed Zipcode Rules (Gzip)
  console.log('Compressing Zipcode Rules (GzipOnly)...');
  const rawRulesContent = JSON.stringify(part2Data);
  const compressedRules = await compressContent(rawRulesContent);
  await fs.writeFile(`${ZIPCODE_RULES_PATH}.gz`, compressedRules);
  console.log(`GZ 檔案已產生：${ZIPCODE_RULES_PATH}.gz`);

  console.timeEnd('Build Data Files');
}

main().catch(console.error);
