import fs from 'node:fs/promises';
import path from 'node:path';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from './core/constants.ts';
import type { Part2Entry } from './core/types.ts';
import { ZipCodeTw, type ZipCodeTwOptions } from './ZipCodeTw.ts';

async function loadFile(filePath: string): Promise<string> {
  const candidates = [
    filePath,
    path.resolve(import.meta.dirname, '../', filePath),
    path.resolve(import.meta.dirname, '../data', path.basename(filePath)),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return await fs.readFile(candidate, 'utf-8');
    } catch {}
  }

  throw new Error(`File not found: ${filePath} (checked candidates: ${candidates.join(', ')})`);
}

/**
 * Node.js helper to create ZipCodeTw instance from local file system.
 * Useful for testing or server-side usage.
 */
export async function createZipCodeTw(
  prefixesPath: string = ADDRESS_PREFIXES_PATH,
  rulesPath: string = ZIPCODE_RULES_PATH,
  options?: ZipCodeTwOptions
): Promise<ZipCodeTw> {
  const prefixesContent = await loadFile(prefixesPath);
  const rulesContent = await loadFile(rulesPath);
  const rulesData: Part2Entry[] = JSON.parse(rulesContent);

  return ZipCodeTw.fromData(prefixesContent, rulesData, options);
}
