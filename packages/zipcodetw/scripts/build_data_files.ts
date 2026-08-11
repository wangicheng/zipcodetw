import fs from 'node:fs/promises';
import path from 'node:path';
import { compileBinaryAssets, main as runDbfPipeline } from '../../../tools/data-crawler/fetch_official_dbf.ts';
import type { RawAddress } from '../src/core/types.ts';

async function main() {
  const customJsonArgIdx = process.argv.indexOf('--json');
  if (customJsonArgIdx !== -1 && process.argv[customJsonArgIdx + 1]) {
    const customJsonPath = process.argv[customJsonArgIdx + 1];
    console.log(`📂 從自訂 JSON 檔案載入地址資料: ${customJsonPath}`);
    const content = await fs.readFile(customJsonPath, 'utf-8');
    const customData: RawAddress[] = JSON.parse(content);
    await compileBinaryAssets(customData);
    return;
  }

  // Default: Direct end-to-end memory pipeline from DBF to binary assets
  await runDbfPipeline();
}

main().catch((err) => {
  console.error('❌ 二進制資料編譯發生錯誤:', err);
  process.exit(1);
});
