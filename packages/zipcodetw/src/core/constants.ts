import path from 'node:path';

export const DATA_DIR_NAME = 'data';
export const ADDRESS_PREFIXES_FILENAME = 'address_prefixes.bin';
export const ZIPCODE_RULES_FILENAME = 'zipcode_rules.bin';

// Paths relative to project root
export const ADDRESS_PREFIXES_PATH = path.join(DATA_DIR_NAME, ADDRESS_PREFIXES_FILENAME);
export const ZIPCODE_RULES_PATH = path.join(DATA_DIR_NAME, ZIPCODE_RULES_FILENAME);
