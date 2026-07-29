import { AddressQueryService } from './core/AddressQueryService.ts';
import { AddressSearchEngineOptimized } from './core/AddressSearchEngine.ts';
import type { AddressNormalizer } from './core/normalizer/AddressNormalizer.ts';
import type { AddressRanker } from './core/ranker/AddressRanker.ts';
import type { Part2Entry, SearchMatch } from './core/types.ts';
import { decodeFrontCode } from './utils/frontCode.ts';

export interface ZipCodeTwOptions {
  normalizer?: AddressNormalizer;
  ranker?: AddressRanker;
}

export class ZipCodeTw {
  private service: AddressQueryService;

  constructor(service: AddressQueryService) {
    this.service = service;
  }

  /**
   * Helper to fetch text from a URL.
   */
  private static async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${url} (${res.status} ${res.statusText})`);
    }

    return await res.text();
  }

  /**
   * Initialize using URLs (Browser friendly).
   * Fetches data and initializes the service.
   *
   * @param prefixesUrl URL to address_prefixes file (e.g. "data/address_prefixes.txt")
   * @param rulesUrl URL to zipcode_rules file (e.g. "data/zipcode_rules.json")
   * @param options Optional custom normalizer or ranker
   */
  public static async create(prefixesUrl: string, rulesUrl: string, options?: ZipCodeTwOptions): Promise<ZipCodeTw> {
    const [prefixesContent, rulesJsonStr] = await Promise.all([ZipCodeTw.fetchText(prefixesUrl), ZipCodeTw.fetchText(rulesUrl)]);

    let part2Data: Part2Entry[];
    try {
      part2Data = JSON.parse(rulesJsonStr);
    } catch {
      throw new Error('Failed to parse rules JSON');
    }

    return ZipCodeTw.fromData(prefixesContent, part2Data, options);
  }

  /**
   * Initialize using pre-loaded data.
   *
   * @param prefixesContent content of address_prefixes (can be FrontCode encoded)
   * @param rulesData parsed content of zipcode_rules (Part2Entry array)
   * @param options Optional custom normalizer or ranker
   */
  public static fromData(prefixesContent: string, rulesData: Part2Entry[], options?: ZipCodeTwOptions): ZipCodeTw {
    // Decode Front Code if applicable
    const expandedPrefixes = decodeFrontCode(prefixesContent);

    // Initialize Engine
    const engine = new AddressSearchEngineOptimized(expandedPrefixes);

    // Initialize Service with optional normalizer/ranker
    const service = new AddressQueryService(engine, rulesData, options?.normalizer, options?.ranker);

    return new ZipCodeTw(service);
  }

  /**
   * Search for a zipcode by address.
   * @param address Full address string (e.g. "台北市大安區和平東路三段")
   * @param threshold Max results to return (default: 1000)
   * @returns Array of matched results
   */
  public search(address: string, threshold?: number): SearchMatch[] {
    return this.service.search(address, threshold);
  }
}
