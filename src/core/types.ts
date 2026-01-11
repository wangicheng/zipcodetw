export interface AddressRule {
  /** Exact match path value */
  value?: number[];
  /** Min value constraint (Range Start) */
  min?: number[];
  /** Max value constraint (Range End) */
  max?: number[];
  /** Parity constraint ('odd' | 'even' | others) */
  parity?: string;
}

export interface RawAddress {
  /** City */
  city: string;
  /** District */
  district: string;
  /** Road */
  road: string;
  /** Section */
  section: string;
  /** Delivery range */
  range: string;
  /** Bulk name */
  bulkName: string;
  /** Zipcode */
  zipcode: string;
}

export interface Part2Entry {
  id: number;
  part1Index: number;
  rules: AddressRule[];
  range: string;
  bulkName: string;
  zipcode: string;
}

export interface SearchMatch {
  part1: string;
  part2: string;
  part2Numbers: number[];
  bulkName: string;
  zipcode: string;
  ruleCount?: number;
  rangeSize?: number;
}
