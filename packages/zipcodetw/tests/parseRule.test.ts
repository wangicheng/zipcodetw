import { describe, test } from 'bun:test';
import assert from 'node:assert';

import { parseAddress } from '../scripts/utils/parseRule.ts';
import type { AddressRule } from '../src/core/types.ts';

const testCases: { input: string; expected: AddressRule[] }[] = [
  { input: '全', expected: [] },
  { input: '單全', expected: [{ parity: 'odd' }] },
  { input: '雙全', expected: [{ parity: 'even' }] },
  { input: '5巷全', expected: [{ value: [5], unit: '巷', subMode: 'all' }] },
  { input: '3巷單全', expected: [{ value: [3], unit: '巷' }, { parity: 'odd' }] },
  {
    input: '536巷全2樓以下',
    expected: [
      { value: [536], unit: '巷', subMode: 'all' },
      { max: [2], unit: '樓' },
    ],
  },
  { input: '267巷單全2樓以下', expected: [{ value: [267], unit: '巷' }, { parity: 'odd' }, { max: [2], unit: '樓' }] },
  { input: '雙30號至32號', expected: [{ min: [30], max: [32], parity: 'even', unit: '號' }] },
  {
    input: '24巷雙6號至24號',
    expected: [
      { value: [24], unit: '巷' },
      { min: [6], max: [24], parity: 'even', unit: '號' },
    ],
  },
  {
    input: '24巷單3之11號以上',
    expected: [
      { value: [24], unit: '巷' },
      { min: [3, 11], parity: 'odd', unit: '號' },
    ],
  },
  {
    input: '277巷25弄雙26號至50號',
    expected: [
      { value: [277], unit: '巷' },
      { value: [25], unit: '弄' },
      { min: [26], max: [50], parity: 'even', unit: '號' },
    ],
  },
  {
    input: '277巷4弄單11號以下',
    expected: [
      { value: [277], unit: '巷' },
      { value: [4], unit: '弄' },
      { max: [11], parity: 'odd', unit: '號' },
    ],
  },
  {
    input: '連151號至151之3號3樓以上',
    expected: [{ value: [151] }, { min: [0], max: [3], parity: '連', unit: '號' }, { min: [3], unit: '樓' }],
  },
  {
    input: '單25號至41號2樓至12樓',
    expected: [
      { min: [25], max: [41], parity: 'odd', unit: '號' },
      { min: [2], max: [12], unit: '樓' },
    ],
  },
  {
    input: '283巷連1之1號至之2號',
    expected: [{ value: [283], unit: '巷' }, { value: [1] }, { min: [1], max: [2], parity: '連', unit: '號' }],
  },
  { input: '雙720號至1092巷', expected: [{ min: [720], max: [1092], parity: 'even', unit: '號', endUnit: '巷' }] },
  { input: '2號含附號', expected: [{ value: [2], unit: '號', subMode: 'sub_all' }] },
  {
    input: '雙98號至102號含附號',
    expected: [{ min: [98], max: [102], parity: 'even', unit: '號', subMode: 'sub_all' }],
  },
  {
    input: '118巷單7號含附號以下',
    expected: [
      { value: [118], unit: '巷' },
      { max: [7], parity: 'odd', unit: '號', subMode: 'sub_all' },
    ],
  },
  { input: '1之23號及以上附號', expected: [{ value: [1] }, { min: [23] }] },
  { input: '7附號', expected: [{ value: [7], unit: '附號' }] },
  { input: '142附號', expected: [{ value: [142], unit: '附號' }] },
  {
    input: '7號地下3樓至1樓',
    expected: [
      { value: [7], unit: '號' },
      { min: [-3], max: [1], unit: '樓' },
    ],
  },
  {
    input: '雙56號至60號地下1樓至1樓',
    expected: [
      { min: [56], max: [60], parity: 'even', unit: '號' },
      { min: [-1], max: [1], unit: '樓' },
    ],
  },
];

describe('parseAddress Rule Tests', () => {
  for (const { input, expected } of testCases) {
    test(`should parse "${input}" correctly`, () => {
      const actual = parseAddress(input);
      assert.deepStrictEqual(actual, expected);
    });
  }
});
