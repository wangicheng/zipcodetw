import fs from 'node:fs/promises';
import path from 'node:path';
import { buildLocalDbfPipeline, compileBinaryAssets, fetchRemoteDataAndBuild } from './crawler/fetch_official_dbf.ts';
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

  // 套件建置時連線抓取最新官方郵遞區號資料並編譯二進制檔
  try {
    console.log('📡 正在於建置階段自動抓取最新的中華郵政 3+3 郵遞區號資料...');
    await fetchRemoteDataAndBuild();
  } catch (err) {
    console.warn('⚠️ 遠端抓取最新資料失敗，嘗試使用本地 DBF 檔案備援:', err);
    await buildLocalDbfPipeline();
  }
}

main().catch((err) => {
  console.error('❌ 二進制資料編譯發生錯誤:', err);
  process.exit(1);
});
