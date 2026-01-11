import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { recognizeCaptcha } from '../scripts/crawler/solve_captcha';

describe('Captcha Recognition', () => {
  const fixturesDir = join(import.meta.dir, 'fixtures', 'captchas');

  if (!existsSync(fixturesDir)) {
    test('skip: no fixtures directory', () => {
      console.warn(`[跳過測試] 找不到測試圖片目錄: ${fixturesDir}`);
    });
  } else {
    const files = readdirSync(fixturesDir).filter((file) => /\.(png|jpg|jpeg|gif)$/i.test(file));

    if (files.length === 0) {
      test('skip: no image files', () => {
        console.warn(`[跳過測試] 在 ${fixturesDir} 中找不到任何圖片檔`);
      });
    }

    for (const file of files) {
      const { name: expectedResult } = parse(file);
      const imagePath = join(fixturesDir, file);

      test(`recognize ${file} as ${expectedResult}`, async () => {
        const result = await recognizeCaptcha(imagePath);
        expect(result).toBe(expectedResult);
      });
    }
  }
});
