import { AddressQueryService } from './core/AddressQueryService.ts';
import { AddressSearchEngineOptimized } from './core/AddressSearchEngine.ts';
import type { Part2Entry, SearchMatch } from './core/types.ts';
import { decodeFrontCode } from './utils/frontCode.ts';

export class ZipCodeTw {
  private service: AddressQueryService;

  constructor(service: AddressQueryService) {
    this.service = service;
  }

  /**
   * Helper to fetch and decompress a file if needed.
   * Expects the browser global `fetch` and `DecompressionStream`.
   */
  private static async fetchAndDecompress(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${url} (${res.status} ${res.statusText})`);
    }

    // If it's a gzip file, use DecompressionStream
    if (url.endsWith('.gz')) {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = res.body?.pipeThrough(ds);
      if (!decompressedStream) throw new Error('Response body is null');
      return await new Response(decompressedStream).text();
    }

    // Otherwise just return text
    return await res.text();
  }

  /**
   * Initialize using URLs (Browser friendly).
   * Fetches data, decompresses if .gz, and initializes the service.
   *
   * @param prefixesUrl URL to address_prefixes file (e.g. "data/prefixes.txt.gz")
   * @param rulesUrl URL to zipcode_rules file (e.g. "data/rules.json.gz")
   */
  public static async create(prefixesUrl: string, rulesUrl: string): Promise<ZipCodeTw> {
    const [prefixesContent, rulesJsonStr] = await Promise.all([ZipCodeTw.fetchAndDecompress(prefixesUrl), ZipCodeTw.fetchAndDecompress(rulesUrl)]);

    let part2Data: Part2Entry[];
    try {
      part2Data = JSON.parse(rulesJsonStr);
    } catch {
      throw new Error('Failed to parse rules JSON');
    }

    return ZipCodeTw.fromData(prefixesContent, part2Data);
  }

  /**
   * Initialize using pre-loaded data.
   *
   * @param prefixesContent content of address_prefixes (can be FrontCode encoded)
   * @param rulesData parsed content of zipcode_rules (Part2Entry array)
   */
  public static fromData(prefixesContent: string, rulesData: Part2Entry[]): ZipCodeTw {
    // Decode Front Code if applicable
    const expandedPrefixes = decodeFrontCode(prefixesContent);

    // Initialize Engine
    const engine = new AddressSearchEngineOptimized(expandedPrefixes);

    // Initialize Service
    const service = new AddressQueryService(engine, rulesData);

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
