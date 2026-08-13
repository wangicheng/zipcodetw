import existsSync from 'node:fs';
import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

import { createExtractorFromFile } from 'node-unrar-js';

import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from '../../src/core/constants.ts';
import type { AddressRule, Part2Entry, RawAddress } from '../../src/core/types.ts';
import { buildBinaryPrefixes, buildBinaryRules } from '../utils/binaryEncoders.ts';
import { parseAddress } from '../utils/parseRule.ts';

export interface DBFField {
  name: string;
  type: string;
  length: number;
}

export class DBFReaderTS {
  public recordCount = 0;
  public headerLen = 0;
  public recordLen = 0;
  public fields: DBFField[] = [];

  public async parseHeader(buf: Buffer) {
    if (buf.length < 32) {
      throw new Error('Invalid DBF header file (too short)');
    }

    this.recordCount = buf.readUInt32LE(4);
    this.headerLen = buf.readUInt16LE(8);
    this.recordLen = buf.readUInt16LE(10);

    this.fields = [];
    let offset = 32;
    while (offset < buf.length && buf[offset] !== 0x0d) {
      const fieldBuf = buf.subarray(offset, offset + 32);
      if (fieldBuf.length < 32) break;

      const name = fieldBuf.subarray(0, 11).toString('ascii').replaceAll('\0', '').trim();
      const type = String.fromCharCode(fieldBuf[11]);
      const length = fieldBuf[16];

      this.fields.push({ name, type, length });
      offset += 32;
    }
  }

  public fetchRecords(buf: Buffer): Record<string, string>[] {
    const decoder = new TextDecoder('big5');
    const records: Record<string, string>[] = [];

    let cursor = this.headerLen;
    for (let i = 0; i < this.recordCount && cursor + this.recordLen <= buf.length; i++) {
      const recBuf = buf.subarray(cursor, cursor + this.recordLen);
      cursor += this.recordLen;

      // Skip deleted records (0x2A == '*')
      if (recBuf[0] === 0x2a) continue;

      let fieldOffset = 1;
      const row: Record<string, string> = {};

      for (const field of this.fields) {
        const valBytes = recBuf.subarray(fieldOffset, fieldOffset + field.length);
        fieldOffset += field.length;
        const val = decoder.decode(valBytes).trim();
        row[field.name] = val;
      }

      records.push(row);
    }

    return records;
  }
}

export function splitRoadAndSection(roadStr: string): [string, string] {
  const match = roadStr.match(/^(.*?)([一二三四五六七八九十0-9０-９]+段)$/);
  if (match && match[1].length > 0) {
    return [match[1], match[2]];
  }
  return [roadStr, '0'];
}

export function findLocalDBF(): string | null {
  const envPath = process.env.ZIP33_DBF_PATH;
  if (envPath && existsSync.existsSync(envPath)) {
    return envPath;
  }

  const defaultPaths = [
    'C:\\Zip33U\\DBF\\rall1.dbf',
    'C:\\Zip33U\\rall1.dbf',
    path.resolve(import.meta.dirname, 'DBF/rall1.dbf'),
    path.resolve(import.meta.dirname, '../../data/DBF/rall1.dbf'),
    path.resolve(import.meta.dirname, '../DBF/rall1.dbf'),
  ];

  for (const p of defaultPaths) {
    if (existsSync.existsSync(p)) {
      return p;
    }
  }

  return null;
}

export async function fetchRemoteDownloadUrls(): Promise<string[]> {
  const officialUrl = 'https://www.post.gov.tw/post/internet/Download/index.jsp?ID=220306';
  console.log(`📡 正在連線中華郵政開放資料下載頁面: ${officialUrl} ...`);
  try {
    const res = await fetch(officialUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.match(/https?:\/\/www\.post\.gov\.tw\/post\/download\/Zip33Usetup_[^\s"\'<>]+\.rar/g) || [];
    return Array.from(new Set(matches)).sort();
  } catch (e) {
    console.warn(`⚠️ 遠端頁面連線失敗: ${e}`);
    return [];
  }
}

export function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fileStream = existsSync.createWriteStream(destPath);
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (!redirectUrl) {
            reject(new Error(`Redirect response missing location header for ${url}`));
            return;
          }
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}, status code: ${res.statusCode}`));
          return;
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });
      },
    );

    req.on('error', (err) => {
      existsSync.unlink(destPath, () => reject(err));
    });
  });
}

export async function findFileRecursively(dirPath: string, fileNameLower: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const found = await findFileRecursively(fullPath, fileNameLower);
        if (found) return found;
      } else if (entry.isFile() && entry.name.toLowerCase() === fileNameLower) {
        return fullPath;
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export async function findFileByExtRecursively(dirPath: string, extLower: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const found = await findFileByExtRecursively(fullPath, extLower);
        if (found) return found;
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(extLower)) {
        return fullPath;
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export async function parseDbfAndCompile(dbfPath: string): Promise<void> {
  console.log(`📍 使用 DBF 檔案: ${dbfPath}`);
  console.log(`⚙️ 正在解析 3+3 郵遞區號門牌對照檔...`);

  const fileBuf = await fs.readFile(dbfPath);
  const reader = new DBFReaderTS();
  await reader.parseHeader(fileBuf);

  const records = reader.fetchRecords(fileBuf);
  console.log(`📊 解析完成！成功讀取 ${records.length.toLocaleString()} 筆有效門牌對照紀錄。`);

  const rawAddresses: RawAddress[] = records.map((r) => {
    const [roadName, section] = splitRoadAndSection(r.ROAD || '');
    return {
      city: r.CITY || '',
      district: r.AREA || '',
      road: roadName,
      section,
      range: r.SCOOP || '',
      bulkName: r.DEPARTMENT || '',
      zipcode: r.ZIPCODE || '',
    };
  });

  await compileBinaryAssets(rawAddresses);
}

export async function compileBinaryAssets(rawAddresses: RawAddress[]) {
  console.log('\n🚀 正在自動轉譯並編譯二進制資產...');

  const grouped = new Map<string, RawAddress[]>();
  for (const addr of rawAddresses) {
    const key = [addr.city, addr.district, addr.road, addr.section !== '0' ? addr.section : ''].join('');
    const list = grouped.get(key);
    if (list) {
      list.push(addr);
    } else {
      grouped.set(key, [addr]);
    }
  }

  const sortedData: RawAddress[] = [];
  for (const group of grouped.values()) {
    for (const item of group) {
      sortedData.push(item);
    }
  }

  const addressStrings = sortedData.map((addr) => {
    return [addr.city, addr.district, addr.road, addr.section !== '0' ? addr.section : ''].join('').trim();
  });
  const part1List = Array.from(new Set(addressStrings.filter(Boolean)));

  const binPrefixesBuf = buildBinaryPrefixes(part1List);
  const prefixPath = path.resolve(import.meta.dirname, '../../', ADDRESS_PREFIXES_PATH);
  await fs.writeFile(prefixPath, binPrefixesBuf);
  console.log(`✨ 門牌前綴二進制檔已產生：${prefixPath} (${(binPrefixesBuf.length / 1024).toFixed(2)} KB)`);

  const addressToIndex = new Map(part1List.map((addr, i) => [addr, i]));

  const part2Data: Part2Entry[] = sortedData.map((addr, i) => {
    const addrStr = addressStrings[i];
    const part1Index = addressToIndex.get(addrStr) ?? -1;

    let rules: AddressRule[] = [];
    try {
      rules = parseAddress(addr.range.replaceAll(' ', ''));
    } catch (e) {
      console.warn(`Failed to parse range for "${addrStr}": ${addr.range}`, e);
    }

    const bulkName = addr.bulkName.replaceAll(' ', '');
    return {
      id: i,
      part1Index,
      zipcode: addr.zipcode.replaceAll(' ', ''),
      rules,
      range: '',
      bulkName,
    };
  });

  const binRulesBuf = buildBinaryRules(part2Data);
  const rulesPath = path.resolve(import.meta.dirname, '../../', ZIPCODE_RULES_PATH);
  await fs.writeFile(rulesPath, binRulesBuf);
  console.log(`✨ 郵遞區號二進制規則檔已產生：${rulesPath} (${(binRulesBuf.length / 1024 / 1024).toFixed(2)} MB)`);
}

/**
 * 遠端抓取管線 (於套件建置階段自動呼叫)
 * 連線遠端下載官方 RAR 檔並解壓轉譯
 */
export async function fetchRemoteDataAndBuild(): Promise<void> {
  console.log('============================================================');
  console.log(' 📮 中華郵政 3+3 郵遞區號官方資料遠端抓取與編譯工具');
  console.log('============================================================');

  const urls = await fetchRemoteDownloadUrls();
  if (urls.length === 0) {
    throw new Error('❌ 無法從中華郵政官網取得遠端下載連結，請確認網路連線或官方頁面架構變更。');
  }

  console.log(`🔗 找到 ${urls.length} 個官方 RAR 下載連結:`);
  for (const u of urls) {
    console.log(`  - ${u}`);
  }

  const downloadsDir = path.resolve(import.meta.dirname, 'DBF/downloads');
  await fs.mkdir(downloadsDir, { recursive: true });

  const downloadedFiles: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fileName = path.basename(url);
    const dest = path.join(downloadsDir, fileName);
    console.log(`⬇️ 正在下載 (${i + 1}/${urls.length}): ${fileName} ...`);
    await downloadFile(url, dest);
    downloadedFiles.push(dest);
  }

  console.log('📦 所有 RAR 檔案下載完成，正在準備解壓縮...');
  const extractDir = path.join(downloadsDir, 'extracted');
  await fs.mkdir(extractDir, { recursive: true });

  try {
    const mainRarFile = downloadedFiles[0];
    const extractor = await createExtractorFromFile({
      filepath: mainRarFile,
      targetPath: extractDir,
    });
    const extractedResult = extractor.extract();
    console.log(`📂 已完成 RAR 壓縮包解壓，包含 ${[...extractedResult.files].length} 個檔案。`);

    const exeFile = await findFileByExtRecursively(extractDir, '.exe');
    if (exeFile) {
      console.log(`📦 檢測到 SFX 自解壓執行檔: ${path.basename(exeFile)}，正在解壓縮內含資料庫...`);
      const sfxExtractor = await createExtractorFromFile({
        filepath: exeFile,
        targetPath: extractDir,
      });
      const sfxResult = sfxExtractor.extract();
      console.log(`📂 SFX 解壓完成，包含 ${[...sfxResult.files].length} 個檔案。`);
    }
  } catch (err) {
    console.warn('⚠️ node-unrar-js 解壓過程發出警告或訊息:', err);
  }

  // 尋找解壓目錄下的 rall1.dbf
  const dbfPath = await findFileRecursively(extractDir, 'rall1.dbf');

  if (!dbfPath) {
    throw new Error(
      `❌ 已下載官方套件 (${downloadedFiles.map((f) => path.basename(f)).join(', ')})，但在解壓目錄 (${extractDir}) 中無法找到 rall1.dbf 檔案。`,
    );
  }

  await parseDbfAndCompile(dbfPath);
  console.log('\n🎉 遠端資料抓取、解析與二進制編譯全部順利完成！');
}

/**
 * 本地編譯管線 (用於 bun run build:data 備援)
 */
export async function buildLocalDbfPipeline(): Promise<void> {
  console.log('============================================================');
  console.log(' 📮 中華郵政 3+3 郵遞區號本地 DBF 編譯工具');
  console.log('============================================================');

  const dbfPath = findLocalDBF();
  if (!dbfPath) {
    throw new Error(
      '❌ 未在預設路徑找到 rall1.dbf 檔案！\n' +
        '   請將 rall1.dbf 放置於 C:\\Zip33U\\DBF\\rall1.dbf 或 packages/zipcodetw/scripts/crawler/DBF/rall1.dbf。',
    );
  }

  await parseDbfAndCompile(dbfPath);
  console.log('\n🎉 本地 DBF 解析與二進制編譯全部順利完成！');
}

if (import.meta.main) {
  fetchRemoteDataAndBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
