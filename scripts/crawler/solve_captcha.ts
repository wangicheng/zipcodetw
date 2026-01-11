import { Jimp } from 'jimp';

const CONFIG = {
  WIDTH: 120,
  HEIGHT: 40,
  DIGIT_W: 24,
  DIGIT_H: 34,
  POSITIONS: [11, 36, 61, 86],
  BINARY_THRESHOLD: 128,
  MIN_CONFIDENCE: 0.85,
};

// 這裡填入透過轉換工具生成的 Hex 字串
const TEMPLATES_HEX: Record<string, string> = {
  '0': '007f0001ffc003ffe007c1f00f00781e007c1e003c3c001e3c001e3c001e3c001e78000f78000f78000f78000f78000f78000f78000f78000f78000f78000f78000f78000f3c001e3c001e3c001e3c001e1e003c1e007c0f007807c1f003ffe001ffc0007f00',
  '1': '000000007e0007fe001ffe001f9e00181e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e00001e000ffffc0ffffc0ffffc',
  '2': '03fe003fff807fffe07f03f07800f860007840007800003c00003c00003c00003c00003c00007c0000780000f80001f00001f00003e00007c0000f80001f00003e00007e0000fc0001f80003f00007e0000fc0001f80003f00007e00007ffffc7ffffc7ffffc',
  '3': '07fe003fffc03fffe03e03f02000f800007800003c00003c00003c00003c00003c00003c0000780000f80003f001ffe001ff8001ffe00001f800007c00003c00003e00001e00001e00001e00001e00001e00003c40003c6000f87c03f87ffff03fffc003fe00',
  '4': '0000000007e0000fe0000fe0001fe0001de0003de00079e00071e000f1e001e1e001c1e003c1e00781e00781e00f01e01e01e01e01e03c01e07801e07801e0f001e0f001e0ffffffffffffffffff0001e00001e00001e00001e00001e00001e00001e00001e0',
  '5': '0000003ffff03ffff03ffff03c00003c00003c00003c00003c00003c00003c00003c00003ffc003fff803fffc03c07e02001f00000f800007800007c00003c00003c00003c00003c00003c00003c00007c0000780000f84001f07807e07fffc07fff800ffc00',
  '6': '001ff000fffc01fffc03e03c0780040f00001e00001e00003c00003c00003c0000387f8079ffe07bfff07fc0f87f807c7f003e7e001e7e001e7c000f7c000f7c000f7c000f3c000f3c000f3c000f3e001e1e001e1f003e0f807c07c0f803fff001ffe0007f80',
  '7': '0000007ffffc7ffffc7ffffc0000780000780000f80000f00000f00001f00001e00003e00003c00003c00007c0000780000780000f80000f00001f00001e00001e00003e00003c00003c0000780000780000f80000f00000f00001f00001e00001e00003c000',
  '8': '00ff8003ffe007fff00f81f81f007c1e003c3c001e3c001e3c001e3c001e3c001e3c001e1e003c1f007c0fc1f803ffe001ffc007fff01f80fc1e003c3c001e7c001f78000f78000f78000f78000f78000f7c001f3c001e3e003e1f80fc0ffff807fff000ff80',
  '9': '00ff0003ffc007ffe00f81f01f00f83e007c3c003c3c003e78001e78001e78001e78001f78001f78001f78001f7c003f3c003f3e007f1f00ff0f81ff07ffef03ffcf00ff0e00001e00001e00001e00003c00003c0000781000f01e03e01fffc01fff0007fc00',
};

let _cachedTemplates: Record<string, number[]> | null = null;

function getTemplates(): Record<string, number[]> {
  if (_cachedTemplates) return _cachedTemplates;

  _cachedTemplates = {};
  for (const [key, hex] of Object.entries(TEMPLATES_HEX)) {
    _cachedTemplates[key] = hexToBinaryArray(hex);
  }
  return _cachedTemplates;
}

function hexToBinaryArray(hex: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < hex.length; i++) {
    const val = parseInt(hex[i], 16);
    result.push((val >> 3) & 1);
    result.push((val >> 2) & 1);
    result.push((val >> 1) & 1);
    result.push((val >> 0) & 1);
  }
  return result;
}

export async function recognizeCaptcha(source: string | Buffer): Promise<string> {
  try {
    const image = await Jimp.read(source);
    image.greyscale();

    let result = '';

    for (let i = 0; i < CONFIG.POSITIONS.length; i++) {
      const xPos = CONFIG.POSITIONS[i];
      const currentPixels = extractFeatureMatrix(image, xPos, (CONFIG.HEIGHT - CONFIG.DIGIT_H) / 2, CONFIG.DIGIT_W, CONFIG.DIGIT_H);

      const match = findBestMatch(currentPixels);
      result += match.digit;
    }

    return result;
  } catch (err) {
    console.error('Image processing failed:', err);
    return '';
  }
}

function extractFeatureMatrix(image, startX: number, startY: number, w: number, h: number): number[] {
  const matrix: number[] = [];
  const bitmap = image.bitmap;

  startX = Math.floor(startX);
  startY = Math.floor(startY);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = ((startY + y) * bitmap.width + (startX + x)) * 4;
      const r = bitmap.data[idx];
      matrix.push(r < CONFIG.BINARY_THRESHOLD ? 1 : 0);
    }
  }
  return matrix;
}

function findBestMatch(currentPixels: number[]): { digit: string; confidence: number } {
  let bestMatch = '?';
  let maxConfidence = -1;

  const templates = getTemplates();
  const totalPixels = currentPixels.length;

  if (Object.keys(templates).length === 0) {
    return { digit: '?', confidence: 0 };
  }

  for (const [digit, templatePixels] of Object.entries(templates)) {
    const len = Math.min(totalPixels, templatePixels.length);
    let matchCount = 0;

    for (let i = 0; i < len; i++) {
      if (currentPixels[i] === templatePixels[i]) {
        matchCount++;
      }
    }

    const confidence = matchCount / totalPixels;

    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      bestMatch = digit;
    }
  }

  return { digit: bestMatch, confidence: maxConfidence };
}
