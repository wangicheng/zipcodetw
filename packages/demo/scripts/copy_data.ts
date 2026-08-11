import fs from 'node:fs/promises';
import path from 'node:path';

async function copyData() {
  const srcDir = path.resolve(import.meta.dirname, '../../zipcodetw/data');
  const destDir = path.resolve(import.meta.dirname, '../public/data');

  // Clean destDir if exists
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });

  const files = await fs.readdir(srcDir);
  for (const file of files) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    await fs.copyFile(srcFile, destFile);
    console.log(`Copied ${file} -> public/data/${file}`);
  }
}

copyData().catch(console.error);
