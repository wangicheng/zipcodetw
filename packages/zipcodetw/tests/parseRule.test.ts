import { describe, test } from 'bun:test';
import assert from 'node:assert';
import type { AddressRule } from '../src/core/types.ts';
import { parseAddress } from '../scripts/utils/parseRule.ts';

const testCases: { input: string; expected: AddressRule[] }[] = [
  { input: '全', expected: [] },
  { input: '單全', expected: [{ parity: 'odd' }] },
  { input: '雙全', expected: [{ parity: 'even' }] },
  { input: '5巷全', expected: [{ value: [5] }] },
  { input: '3巷單全', expected: [{ value: [3] }, { parity: 'odd' }] },
  { input: '536巷全2樓以下', expected: [{ value: [536] }, { max: [2] }] },
  { input: '267巷單全2樓以下', expected: [{ value: [267] }, { parity: 'odd' }, { max: [2] }] },
  { input: '雙30號至32號', expected: [{ min: [30], max: [32], parity: 'even' }] },
  { input: '24巷雙6號至24號', expected: [{ value: [24] }, { min: [6], max: [24], parity: 'even' }] },
  { input: '24巷單3之11號以上', expected: [{ value: [24] }, { min: [3, 11], parity: 'odd' }] },
  { input: '277巷25弄雙26號至50號', expected: [{ value: [277, 25] }, { min: [26], max: [50], parity: 'even' }] },
  { input: '277巷4弄單11號以下', expected: [{ value: [277, 4] }, { max: [11], parity: 'odd' }] },
  { input: '連151號至151之3號3樓以上', expected: [{ value: [151] }, { max: [3] }, { min: [3] }] },
  {
    input: '單25號至41號2樓至12樓',
    expected: [
      { min: [25], max: [41], parity: 'odd' },
      { min: [2], max: [12] },
    ],
  },
  { input: '283巷連1之1號至之2號', expected: [{ value: [283, 1] }, { min: [1], max: [2] }] },
  { input: '雙720號至1092巷', expected: [{ min: [720], max: [1092], parity: 'even' }] },
  { input: '2號含附號', expected: [{ value: [2] }] },
  { input: '雙98號至102號含附號', expected: [{ min: [98], max: [102], parity: 'even' }] },
  { input: '118巷單7號含附號以下', expected: [{ value: [118] }, { max: [7], parity: 'odd' }] },
  { input: '1之23號及以上附號', expected: [{ value: [1] }, { min: [23] }] },
  { input: '7附號', expected: [{ value: [7] }] },
  { input: '142附號', expected: [{ value: [142] }] },
  { input: '7號地下3樓至1樓', expected: [{ value: [7] }, { min: [-3], max: [1] }] },
  {
    input: '雙56號至60號地下1樓至1樓',
    expected: [
      { min: [56], max: [60], parity: 'even' },
      { min: [-1], max: [1] },
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
