import type { AddressRule } from './types.ts';

/**
 * Check if address matches rules (supports prefix matching)
 * @param address Input address number array
 * @param rules Rule array
 * @returns boolean
 */
export function matchAddress(address: number[], rules: AddressRule[]): boolean {
  let addrIdx = 0;

  for (const rule of rules) {
    // Prefix matched if address exhausted
    if (addrIdx >= address.length) {
      return true;
    }

    // Handle fixed value path
    if (rule.value) {
      // Compare partial if remaining address is short
      const compareLen = Math.min(rule.value.length, address.length - addrIdx);

      for (let i = 0; i < compareLen; i++) {
        if (address[addrIdx + i] !== rule.value[i]) {
          return false;
        }
      }

      addrIdx += rule.value.length;
      continue;
    }

    // Handle condition nodes (Min / Max / Parity)
    const targetLen = getConditionLength(rule);

    if (targetLen > 0) {
      // Loose match if insufficient remaining address
      if (addrIdx + targetLen > address.length) {
        return true;
      }

      const targetSlice = address.slice(addrIdx, addrIdx + targetLen);

      // Check parity
      if (rule.parity) {
        const numToCheck = targetSlice[targetSlice.length - 1];
        const isOdd = numToCheck % 2 !== 0;
        if (rule.parity === 'odd' && !isOdd) return false;
        if (rule.parity === 'even' && isOdd) return false;
      }

      // Check min value
      if (rule.min && compare(targetSlice, rule.min) < 0) return false;

      // Check max value
      if (rule.max && compare(targetSlice, rule.max) > 0) return false;

      addrIdx += targetLen;
    }
  }

  return true;
}

function getConditionLength(rule: AddressRule): number {
  if (!rule.min && !rule.max && !rule.parity) return 0;
  let len = 0;
  if (rule.min) len = Math.max(len, rule.min.length);
  if (rule.max) len = Math.max(len, rule.max.length);
  if (len === 0 && rule.parity) return 1;
  return len;
}

function compare(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}
