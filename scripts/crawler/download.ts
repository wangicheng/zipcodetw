import { RAW_ADDRESSES_PATH } from '../../src/core/constants';
import { recognizeCaptcha } from './solve_captcha';
import { Downloader, getPageData } from './downloader';

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

// Save to workspace root
await Bun.write(RAW_ADDRESSES_PATH, JSON.stringify(addresses));

console.log(`Saved to ${RAW_ADDRESSES_PATH}`);
