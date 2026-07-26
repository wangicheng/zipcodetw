import path from 'node:path';
import { Downloader, getPageData } from './downloader.ts';
import { recognizeCaptcha } from './solve_captcha.ts';

const targetPath = path.resolve(import.meta.dirname, '../../packages/zipcodetw/data/raw_addresses.json');

console.log('Fetching page data...');
const data = await getPageData();

console.log(`Server Update Date: ${data.updateDate}`);

const vKey = data.captchaUrl.searchParams.get('vKey');
if (!vKey) throw new Error('vKey not found');

console.log(`Downloading captcha from ${data.captchaUrl.href}...`);
const captchaRes = await fetch(data.captchaUrl);
if (!captchaRes.ok) throw new Error(`Failed to fetch captcha: ${captchaRes.statusText}`);

const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer());

console.log('Solving captcha...');
const code = await recognizeCaptcha(captchaBuffer);
console.log(`Solved code: ${code}`);

if (!code) throw new Error('Failed to solve captcha');

const downloader = new Downloader(data.cities, vKey, code);

const addresses = await downloader.download();

console.log(`Converted ${addresses.length} addresses.`);

await Bun.write(targetPath, JSON.stringify(addresses));

console.log(`Saved to ${targetPath}`);
