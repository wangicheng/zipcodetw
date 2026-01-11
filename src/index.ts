import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import zlib from 'node:zlib';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from './core/constants.ts';
import type { Part2Entry } from './core/types.ts';
import { ZipCodeTw } from './ZipCodeTw.ts';

const gunzip = promisify(zlib.gunzip);

async function loadFile(filePath: string): Promise<string> {
  try {
    await fs.access(filePath);
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    const gzPath = `${filePath}.gz`;
    try {
      await fs.access(gzPath);
      const buffer = await fs.readFile(gzPath);
      const decompressed = await gunzip(buffer);
      return decompressed.toString('utf-8');
    } catch {
      throw new Error(`File not found: ${filePath} (checked .gz also)`);
    }
  }
}

/**
 * Node.js helper to create ZipCodeTw instance from local file system.
 * Useful for testing or server-side usage.
 */
export async function createZipCodeTw(prefixesPath: string = ADDRESS_PREFIXES_PATH, rulesPath: string = ZIPCODE_RULES_PATH): Promise<ZipCodeTw> {
  const prefixesContent = await loadFile(prefixesPath);
  const rulesContent = await loadFile(rulesPath);
  const rulesData: Part2Entry[] = JSON.parse(rulesContent);

  return ZipCodeTw.fromData(prefixesContent, rulesData);
}
