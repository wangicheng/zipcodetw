import path from 'node:path';

export const DATA_DIR_NAME = 'data';
export const RAW_ADDRESSES_FILENAME = 'raw_addresses.json';
export const ADDRESS_PREFIXES_FILENAME = 'address_prefixes.txt';
export const ZIPCODE_RULES_FILENAME = 'zipcode_rules.json';

// Paths relative to project root
export const RAW_ADDRESSES_PATH = path.join(DATA_DIR_NAME, RAW_ADDRESSES_FILENAME);
export const ADDRESS_PREFIXES_PATH = path.join(DATA_DIR_NAME, ADDRESS_PREFIXES_FILENAME);
export const ZIPCODE_RULES_PATH = path.join(DATA_DIR_NAME, ZIPCODE_RULES_FILENAME);
