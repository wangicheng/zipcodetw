import { main } from './fetch_official_dbf.ts';

main().catch((err) => {
  console.error('❌ 資料取得與轉換過程發生錯誤:', err);
  process.exit(1);
});
