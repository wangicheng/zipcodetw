import fs from 'node:fs/promises';
import path from 'node:path';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from './core/constants.ts';
import { ZipCodeTw, type ZipCodeTwOptions } from './ZipCodeTw.ts';

async function loadBufferFile(filePath: string): Promise<Uint8Array> {
  const candidates = [filePath, path.resolve(import.meta.dirname, '../', filePath), path.resolve(import.meta.dirname, '../data', path.basename(filePath))];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      const buf = await fs.readFile(candidate);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {}
  }

  throw new Error(`Buffer file not found: ${filePath} (checked candidates: ${candidates.join(', ')})`);
}

/**
 * Node.js helper to create ZipCodeTw instance using binary assets for 100% zero-expansion memory efficiency.
 */
export async function createZipCodeTw(
  prefixesPath: string = ADDRESS_PREFIXES_PATH,
  rulesPath: string = ZIPCODE_RULES_PATH,
  options?: ZipCodeTwOptions,
): Promise<ZipCodeTw> {
  const [binaryPrefixes, binaryRules] = await Promise.all([loadBufferFile(prefixesPath), loadBufferFile(rulesPath)]);
  return ZipCodeTw.fromBinary(binaryPrefixes, binaryRules, options);
}
