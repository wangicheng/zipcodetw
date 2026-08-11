import fs from 'node:fs/promises';
import existsSync from 'node:fs';
import path from 'node:path';
import { buildBinaryPrefixes, buildBinaryRules } from '../../packages/zipcodetw/scripts/utils/binaryEncoders.ts';
import type { AddressRule, Part2Entry, RawAddress } from '../../packages/zipcodetw/src/core/types.ts';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from '../../packages/zipcodetw/src/core/constants.ts';
import { parseAddress } from '../../packages/zipcodetw/scripts/utils/parseRule.ts';

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
    path.resolve(import.meta.dirname, '../../packages/zipcodetw/data/DBF/rall1.dbf'),
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
  const prefixPath = path.resolve(import.meta.dirname, '../../packages/zipcodetw/', ADDRESS_PREFIXES_PATH);
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
  const rulesPath = path.resolve(import.meta.dirname, '../../packages/zipcodetw/', ZIPCODE_RULES_PATH);
  await fs.writeFile(rulesPath, binRulesBuf);
  console.log(`✨ 郵遞區號二進制規則檔已產生：${rulesPath} (${(binRulesBuf.length / 1024 / 1024).toFixed(2)} MB)`);
}

export async function main() {
  console.log('============================================================');
  console.log(' 📮 中華郵政 3+3 郵遞區號官方 DBF 資料取得與二進制編譯工具 (Pure TS)');
  console.log('============================================================');

  const dbfPath = findLocalDBF();
  if (dbfPath) {
    console.log(`📍 找到本地官方 DBF 檔案: ${dbfPath}`);
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
    console.log('\n🎉 資料下載、解析與二進制編譯全部順利完成！');
  } else {
    console.log('🔍 未在預設路徑找到 rall1.dbf，嘗試從遠端取得下載連結...');
    const urls = await fetchRemoteDownloadUrls();
    if (urls.length > 0) {
      console.log('🔗 找到最新官方下載連結:');
      for (const u of urls) {
        console.log(`  - ${u}`);
      }
      console.log('\n💡 提示: 請解壓縮 Zip33Usetup RAR 檔案後，將 rall1.dbf 放置於以下任一路徑：');
      console.log('   1. C:\\Zip33U\\DBF\\rall1.dbf');
      console.log('   2. tools/data-crawler/DBF/rall1.dbf');
    } else {
      console.error('❌ 無法取得 remote 下載連結，請確認網路連線或將 rall1.dbf 放置於 C:\\Zip33U\\DBF\\');
    }
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
