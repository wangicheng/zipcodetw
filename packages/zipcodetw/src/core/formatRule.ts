import type { AddressRule } from './types.ts';

function formatNumSeq(numArr: number[]): string {
  return numArr.map((n) => (n < 0 ? `地下${Math.abs(n)}` : `${n}`)).join('之');
}

/**
 * Format Unit-Aware AddressRules back into 100% loss-free Chunghwa Post delivery range display string.
 */
export function formatAddressRule(rules: AddressRule[]): string {
  if (!rules || rules.length === 0) {
    return '全';
  }

  const parts: string[] = [];
  let prevValueNode: AddressRule | null = null;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    let prefix = '';
    if (rule.parity === 'odd') prefix = '單';
    else if (rule.parity === 'even') prefix = '雙';
    else if (rule.parity === '連') prefix = '連';

    const unit = rule.unit || '號';
    const endUnit = rule.endUnit || unit;
    let allSuffix = '';
    if (rule.subMode === 'all') allSuffix = '全';
    else if (rule.subMode === 'sub_all') allSuffix = '含附號';

    if (rule.parity && !rule.value && !rule.min && !rule.max && !rule.unit) {
      parts.push(`${prefix}全`);
      prevValueNode = null;
      continue;
    }

    if (rule.value && !rule.min && !rule.max) {
      const u = rule.unit || (i < rules.length - 1 ? '巷' : '號');
      parts.push(`${prefix}${formatNumSeq(rule.value)}${u}${allSuffix}`);
      prevValueNode = rule;
      continue;
    }

    // Special sub-number range attached to previous value node (e.g. [342] + { min: [0], max: [1] } -> 342號至342之1號)
    if (rule.min && rule.max && rule.min.length === 1 && rule.min[0] === 0 && prevValueNode && prevValueNode.value) {
      const mainVal = formatNumSeq(prevValueNode.value);
      const maxSub = formatNumSeq(rule.max);
      parts.pop();
      parts.push(`${prefix}${mainVal}${unit}至${mainVal}之${maxSub}${endUnit}${allSuffix}`);
      prevValueNode = null;
      continue;
    }

    // Sub-number range attached to main value node (e.g. [19] + { min: [2], max: [14], unit: '號' } -> 19之2號至之14號)
    if (rule.min && rule.max && prevValueNode && prevValueNode.value && !prevValueNode.unit && rule.unit === '號') {
      const mainVal = formatNumSeq(prevValueNode.value);
      const minSub = formatNumSeq(rule.min);
      const maxSub = formatNumSeq(rule.max);
      parts.pop();
      parts.push(`${prefix}${mainVal}之${minSub}${unit}至之${maxSub}${endUnit}${allSuffix}`);
      prevValueNode = null;
      continue;
    }

    // Sub-number and-above attached to main value node (e.g. [2] + { min: [4] } -> 2之4號及以上附號)
    if (rule.min && !rule.max && prevValueNode && prevValueNode.value && !prevValueNode.unit) {
      const mainVal = formatNumSeq(prevValueNode.value);
      const minSub = formatNumSeq(rule.min);
      parts.pop();
      parts.push(`${prefix}${mainVal}之${minSub}號及以上附號`);
      prevValueNode = null;
      continue;
    }

    if (rule.min && rule.max) {
      const minStr = formatNumSeq(rule.min);
      const maxStr = formatNumSeq(rule.max);
      if (minStr === maxStr) {
        parts.push(`${prefix}${minStr}${unit}${allSuffix}`);
      } else {
        parts.push(`${prefix}${minStr}${unit}至${maxStr}${endUnit}${allSuffix}`);
      }
    } else if (rule.min) {
      const minStr = formatNumSeq(rule.min);
      parts.push(`${prefix}${minStr}${unit}以上${allSuffix}`);
    } else if (rule.max) {
      const maxStr = formatNumSeq(rule.max);
      if (rule.subMode === 'sub_all') {
        parts.push(`${prefix}${maxStr}${endUnit}含附號以下`);
      } else {
        parts.push(`${prefix}${maxStr}${endUnit}以下${allSuffix}`);
      }
    }

    prevValueNode = rule;
  }

  return parts.join('');
}
