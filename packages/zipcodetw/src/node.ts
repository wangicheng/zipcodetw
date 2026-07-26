import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from './core/constants.ts';
import type { Part2Entry } from './core/types.ts';
import { ZipCodeTw, type ZipCodeTwOptions } from './ZipCodeTw.ts';

const gunzip = promisify(zlib.gunzip);

import path from 'node:path';

async function loadSingleFile(p: string): Promise<string> {
  if (p.endsWith('.gz')) {
    const buffer = await fs.readFile(p);
    const decompressed = await gunzip(buffer);
    return decompressed.toString('utf-8');
  }
  return await fs.readFile(p, 'utf-8');
}

async function loadFile(filePath: string): Promise<string> {
  const candidates = [
    filePath,
    `${filePath}.gz`,
    path.resolve(import.meta.dirname, '../', filePath),
    path.resolve(import.meta.dirname, '../', `${filePath}.gz`),
    path.resolve(import.meta.dirname, '../data', path.basename(filePath)),
    path.resolve(import.meta.dirname, '../data', `${path.basename(filePath)}.gz`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return await loadSingleFile(candidate);
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
