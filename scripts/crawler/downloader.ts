import type { RawAddress } from '../../src/core/types';

const BASE_URL = 'https://www.post.gov.tw/post/internet/Postal/index.jsp?ID=208';

interface PageData {
  updateDate: string;
  cities: string[];
  captchaUrl: URL;
}

export async function extractPageData(response: Response): Promise<PageData> {
  let spanText = '';

  let minguoDateStr: string | null = null;
  const cities: string[] = [];
  let captchaSrc: string | null = null;

  const rewriter = new HTMLRewriter()
    .on('span', {
      text(text) {
        spanText += text.text;
        if (minguoDateStr) return;

        if (text.lastInTextNode) {
          const found = spanText.match(/最近更新日期[\s\S]+?(\d+\s*年\s*\d+\s*月\s*\d+\s*日)/);
          if (found?.[1]) {
            minguoDateStr = found[1];
          }

          spanText = '';
        }
      },
    })
    .on('select#city2_zip6 option:not([value="%"])', {
      element(element) {
        const value = element.getAttribute('value');
        if (!value) {
          throw new Error("Found a city <option> tag without a 'value' attribute.");
        }
        cities.push(value);
      },
    })
    .on('img#imgCaptcha2_zip6', {
      element(element) {
        const src = element.getAttribute('src');
        if (!src) {
          throw new Error("Captcha <img> tag is missing the 'src' attribute.");
        }
        captchaSrc = src;
      },
    });

  await rewriter.transform(response).text();

  if (!minguoDateStr) {
    throw new Error('Could not find the update date on the page.');
  }
  if (cities.length === 0) {
    throw new Error('No cities were found.');
  }
  if (!captchaSrc) {
    throw new Error('Could not find the captcha URL on the page.');
  }

  const updateDate = minguoDateStr;

  return {
    updateDate,
    cities,
    captchaUrl: new URL(captchaSrc, BASE_URL),
  };
}

export async function getPageData(): Promise<PageData> {
  const res = await fetch(BASE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  return extractPageData(res);
}

async function extractAddresses(response: Response, city: string): Promise<RawAddress[]> {
  const keys: (keyof RawAddress)[] = ['zipcode', 'district', 'road', 'section', 'range', 'bulkName'];

  let spanText = '';
  let tdText = '';
  const addresses: RawAddress[] = [];
  let currentKey: keyof RawAddress = 'city';

  let parsingError: Error | undefined;
  let isDone = false;

  const rewriter = new HTMLRewriter()
    .on('span', {
      text(text) {
        spanText += text.text;
        if (text.lastInTextNode) {
          if (spanText.includes('驗證碼輸入錯誤')) {
            parsingError = new Error('Invalid captcha');
          }

          spanText = '';
        }
      },
    })
    .on('table.TableStyle_02:not(.pc_cont)', {
      element(element) {
        element.onEndTag(() => {
          isDone = true;
        });
      },
    })
    .on('table.TableStyle_02:not(.pc_cont) > tbody > tr:not(:first-child)', {
      element() {
        if (isDone || parsingError) return;
        addresses.push({ city } as RawAddress);
      },
    })
    .on('table.TableStyle_02:not(.pc_cont) > tbody > tr > td', {
      element() {
        if (isDone || parsingError) return;
        const lastAddress = addresses[addresses.length - 1]!;
        const key = keys.find((k) => !(k in lastAddress));
        if (!key) {
          parsingError = new Error('Unable to find a missing key in the last address.');
          return;
        }
        currentKey = key;
        lastAddress[currentKey] = '';
      },
      text(text) {
        if (isDone || parsingError) return;

        tdText += text.text;

        if (text.lastInTextNode) {
          const lastAddress = addresses[addresses.length - 1]!;
          lastAddress[currentKey] = tdText.trim();

          tdText = '';
        }
      },
    });

  await rewriter.transform(response).text();

  if (parsingError) throw parsingError;

  return addresses;
}

export class Downloader {
  constructor(
    public cities: string[],
    public vKey: string,
    public code: string,
  ) {}

  async download(): Promise<RawAddress[]> {
    const addresses: RawAddress[] = [];
    for (const city of this.cities) {
      console.log(`Starting download for city: ${city}...`);
      const data = await this.getAddressesByCity(city);
      console.log(`Downloaded ${data.length} addresses for ${city}`);
      addresses.push(...data);
    }
    if (addresses.some((address) => Object.keys(address).length !== 7)) throw new Error('Address structure validation failed.');

    return addresses;
  }

  async getAddressesByCity(city: string) {
    const formData = {
      list: '5',
      list_type: '2',
      firstView: '4',
      firstView2: '1',
      vKey: `${this.vKey}\r\n`,
      city2_zip6: city,
      cityarea2_zip6: '%',
      road_zip6: '',
      sec_zip6: '%',
      checkImange2_zip6: this.code,
      Submit: '查詢',
    };

    const formDataString = new URLSearchParams(formData).toString();

    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formDataString,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const addresses = await extractAddresses(res, city);
    return addresses;
  }
}
