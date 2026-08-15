import fs from 'node:fs/promises';
import path from 'node:path';

import type { RawAddress } from '../src/core/types.ts';
import { buildLocalDbfPipeline, compileBinaryAssets } from './crawler/fetch_official_dbf.ts';

async function main() {
  const customDbfArgIdx = process.argv.indexOf('--dbf');
  const customDbfPath = customDbfArgIdx !== -1 ? process.argv[customDbfArgIdx + 1] : undefined;

  const versionArgIdx = process.argv.indexOf('--version');
  const dataVersion = versionArgIdx !== -1 ? process.argv[versionArgIdx + 1] : undefined;

  await buildLocalDbfPipeline(customDbfPath, dataVersion);
}

main().catch((err) => {
  console.error('[ERROR] 二進制資料編譯發生錯誤:', err);
  process.exit(1);
});
