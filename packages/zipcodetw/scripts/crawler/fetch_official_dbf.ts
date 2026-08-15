import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildBinaryPrefixes, buildBinaryRules } from '../../src/compiler/binaryEncoders.ts';
import { parseAddress } from '../../src/compiler/parseRule.ts';
import { ADDRESS_PREFIXES_PATH, ZIPCODE_RULES_PATH } from '../../src/core/constants.ts';
import type { AddressRule, Part2Entry, RawAddress } from '../../src/core/types.ts';

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

  public async parseHeader(buf: Buffer): Promise<void> {
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

export const LOCAL_DBF_PATH = path.resolve(import.meta.dirname, 'DBF/rall1.dbf');

export function findLocalDBF(): string | null {
  const envPath = process.env.ZIP33_DBF_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const projectPaths = [
    LOCAL_DBF_PATH,
    path.resolve(import.meta.dirname, '../../data/rall1.dbf'),
    path.resolve(import.meta.dirname, '../../data/DBF/rall1.dbf'),
    path.resolve(process.cwd(), 'data/rall1.dbf'),
    path.resolve(process.cwd(), 'rall1.dbf'),
    path.resolve(process.cwd(), 'DBF/rall1.dbf'),
  ];

  for (const p of projectPaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  return null;
}

export async function loadOfficialRawAddresses(dbfPath?: string): Promise<RawAddress[]> {
  const targetPath = dbfPath || findLocalDBF();
  if (!targetPath) {
    throw new Error('找不到可用的中華郵政 rall1.dbf 檔案，請透過引數或 ZIP33_DBF_PATH 環境變數指定。');
  }

  const fileBuf = await fs.readFile(targetPath);
  const reader = new DBFReaderTS();
  await reader.parseHeader(fileBuf);
  const records = reader.fetchRecords(fileBuf);

  return records.map((r) => {
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
}

export async function parseDbfAndCompile(dbfPath: string, dataVersion: string = '2026.03'): Promise<void> {
  console.log(`[INFO] 使用 DBF 檔案: ${dbfPath}`);
  console.log(`[INFO] 資料版本標籤: ${dataVersion}`);
  console.log(`[INFO] 正在解析 3+3 郵遞區號門牌對照檔...`);

  const rawAddresses = await loadOfficialRawAddresses(dbfPath);
  console.log(`[INFO] 解析完成！成功讀取 ${rawAddresses.length.toLocaleString()} 筆有效門牌對照紀錄。`);

  await compileBinaryAssets(rawAddresses, dataVersion);
}

export async function compileBinaryAssets(rawAddresses: RawAddress[], dataVersion: string = '2026.03'): Promise<void> {
  console.log('\n[INFO] 正在自動轉譯並編譯二進制資產...');

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

  const binPrefixesBuf = buildBinaryPrefixes(part1List, dataVersion);
  const prefixPath = path.resolve(import.meta.dirname, '../../', ADDRESS_PREFIXES_PATH);
  await fs.writeFile(prefixPath, binPrefixesBuf);
  console.log(`[INFO] 門牌前綴二進制檔已產生：${prefixPath} (${(binPrefixesBuf.length / 1024).toFixed(2)} KB)`);

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

  const binRulesBuf = buildBinaryRules(part2Data, dataVersion);
  const rulesPath = path.resolve(import.meta.dirname, '../../', ZIPCODE_RULES_PATH);
  await fs.writeFile(rulesPath, binRulesBuf);
  console.log(`[INFO] 郵遞區號二進制規則檔已產生：${rulesPath} (${(binRulesBuf.length / 1024 / 1024).toFixed(2)} MB)`);
}

export async function buildLocalDbfPipeline(dbfPath?: string, dataVersion: string = '2026.03'): Promise<void> {
  console.log('============================================================');
  console.log(' 中華郵政 3+3 郵遞區號 DBF 二進制編譯工具');
  console.log('============================================================');

  const targetPath = dbfPath || findLocalDBF();
  if (!targetPath) {
    throw new Error(
      `[ERROR] 專案內部未找到 rall1.dbf 檔案 (${LOCAL_DBF_PATH})。\n` +
        '   請將 rall1.dbf 放置於 packages/zipcodetw/data/rall1.dbf 或設定 ZIP33_DBF_PATH 環境變數。',
    );
  }

  await parseDbfAndCompile(targetPath, dataVersion);
  console.log('\n[INFO] 本地 DBF 解析與二進制編譯全部順利完成！');
}

if (import.meta.main) {
  buildLocalDbfPipeline().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
