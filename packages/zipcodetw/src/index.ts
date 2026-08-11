export { AddressQueryService } from './core/AddressQueryService.ts';
export { AddressSearchEngineOptimized } from './core/AddressSearchEngine.ts';
export { type AddressNormalizer, DefaultAddressNormalizer } from './core/normalizer/AddressNormalizer.ts';
export { type AddressRanker, PostalDeliveryRanker } from './core/ranker/AddressRanker.ts';
export { TAIWAN_DISTRICTS, normalizeCityName, parseCityDistrict } from './core/taiwanDistricts.ts';
export * from './core/types.ts';
export { ZipCodeTw, type ZipCodeTwOptions } from './ZipCodeTw.ts';

