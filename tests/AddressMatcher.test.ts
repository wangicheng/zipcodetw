import { describe, expect, test } from 'bun:test';
import { matchAddress } from '../src/core/AddressMatcher';
import type { AddressRule } from '../src/core/types';

describe('AddressMatcher', () => {
  test('should match exact value', () => {
    const rules: AddressRule[] = [{ value: [1, 2] }];
    expect(matchAddress([1, 2], rules)).toBe(true);
    expect(matchAddress([1, 2, 3], rules)).toBe(true); // Prefix match
    expect(matchAddress([1, 3], rules)).toBe(false);
  });

  test('should match range (min/max)', () => {
    const rules: AddressRule[] = [{ min: [10], max: [20] }];
    expect(matchAddress([15], rules)).toBe(true);
    expect(matchAddress([10], rules)).toBe(true);
    expect(matchAddress([20], rules)).toBe(true);
    expect(matchAddress([9], rules)).toBe(false);
    expect(matchAddress([21], rules)).toBe(false);
  });

  test('should match parity (odd)', () => {
    const rules: AddressRule[] = [{ parity: 'odd' }];
    expect(matchAddress([1], rules)).toBe(true);
    expect(matchAddress([3], rules)).toBe(true);
    expect(matchAddress([2], rules)).toBe(false);
    expect(matchAddress([10], rules)).toBe(false);
  });

  test('should match parity (even)', () => {
    const rules: AddressRule[] = [{ parity: 'even' }];
    expect(matchAddress([2], rules)).toBe(true);
    expect(matchAddress([4], rules)).toBe(true);
    expect(matchAddress([1], rules)).toBe(false);
    expect(matchAddress([11], rules)).toBe(false);
  });

  test('should match validation flow mixed', () => {
    // Rule: Fixed [1], then Range [10-20] Odd
    const rules: AddressRule[] = [{ value: [1] }, { min: [10], max: [20], parity: 'odd' }];

    expect(matchAddress([1, 11], rules)).toBe(true);
    expect(matchAddress([1, 19], rules)).toBe(true);

    expect(matchAddress([2, 11], rules)).toBe(false); // First part mismatch
    expect(matchAddress([1, 12], rules)).toBe(false); // Parity mismatch
    expect(matchAddress([1, 9], rules)).toBe(false); // Min mismatch
    expect(matchAddress([1, 21], rules)).toBe(false); // Max mismatch
  });

  test('should handle loose match if insufficient remaining address', () => {
    // If the address is shorter than the rules, it's considered a partial match (prefix match)
    const rules: AddressRule[] = [{ value: [1] }, { value: [2] }];
    expect(matchAddress([1], rules)).toBe(true);
  });
});
