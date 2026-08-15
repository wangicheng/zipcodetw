import { AddressQueryService } from './core/AddressQueryService.ts';
import { BinaryPrefixSearchEngine } from './core/BinaryPrefixSearchEngine.ts';
import type { AddressNormalizer } from './core/normalizer/AddressNormalizer.ts';
import type { AddressRanker } from './core/ranker/AddressRanker.ts';
import { TAIWAN_DISTRICTS, normalizeCityName, parseCityDistrict } from './core/taiwanDistricts.ts';
import type { SearchMatch } from './core/types.ts';

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
   * Get all Taiwan cities (e.g. ["臺北市", "新北市", ...])
   */
  public static getCities(): string[] {
    return Object.keys(TAIWAN_DISTRICTS);
  }

  /**
   * Instance helper to get all Taiwan cities.
   */
  public getCities(): string[] {
    return ZipCodeTw.getCities();
  }

  /**
   * Get districts by city name (supports alias like "台北" => "臺北市")
   */
  public static getDistricts(city: string): string[] {
    const normCity = normalizeCityName(city);
    return TAIWAN_DISTRICTS[normCity] || [];
  }

  /**
   * Instance helper to get districts by city name.
   */
  public getDistricts(city: string): string[] {
    return ZipCodeTw.getDistricts(city);
  }

  /**
   * Parse city and district from an address string
   */
  public static parseCityDistrict(address: string): { city: string; district: string; detail: string } {
    return parseCityDistrict(address);
  }

  /**
   * Initialize using URLs (Browser friendly) loading binary assets.
   *
   * @param prefixesUrl URL to address_prefixes.bin file
   * @param rulesUrl URL to zipcode_rules.bin file
   * @param options Optional custom normalizer or ranker
   */
  public static async create(prefixesUrl: string, rulesUrl: string, options?: ZipCodeTwOptions): Promise<ZipCodeTw> {
    const [prefixesRes, rulesRes] = await Promise.all([fetch(prefixesUrl), fetch(rulesUrl)]);
    if (!prefixesRes.ok || !rulesRes.ok) {
      throw new Error(`Failed to fetch binary assets: ${prefixesUrl}, ${rulesUrl}`);
    }
    const [binaryPrefixes, binaryRules] = await Promise.all([prefixesRes.arrayBuffer(), rulesRes.arrayBuffer()]);
    return ZipCodeTw.fromBinary(binaryPrefixes, binaryRules, options);
  }

  /**
   * Initialize using pre-loaded binary buffers for zero-expansion memory efficiency.
   *
   * @param binaryPrefixes ArrayBuffer or Uint8Array of address_prefixes.bin
   * @param binaryRules ArrayBuffer or Uint8Array of zipcode_rules.bin
   * @param options Optional custom normalizer or ranker
   */
  public static fromBinary(
    binaryPrefixes: ArrayBuffer | Uint8Array,
    binaryRules: ArrayBuffer | Uint8Array,
    options?: ZipCodeTwOptions,
  ): ZipCodeTw {
    const engine = new BinaryPrefixSearchEngine(binaryPrefixes);
    const service = new AddressQueryService(engine, binaryRules, options?.normalizer, options?.ranker);
    return new ZipCodeTw(service);
  }

  /**
   * Get the version identifier of the underlying postal database (e.g. "2026.03")
   */
  public getDataVersion(): string {
    return this.service.getDataVersion();
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
