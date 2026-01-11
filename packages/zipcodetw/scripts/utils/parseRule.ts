import { CstParser, createToken, Lexer } from 'chevrotain';
import type { AddressRule } from '../../src/core/types.ts';

// ==========================================
// 1. Data Structure Definitions
// ==========================================

interface ASTSegment {
  modifier?: string;
  op: 'exact' | 'range' | 'min' | 'max' | 'parity_all';
  subMode?: 'all' | 'more';
  start?: NumberValue;
  end?: NumberValue;
}

interface NumberValue {
  main: number | null;
  sub: number | null;
  unit?: string;
}

// ==========================================
// 2. Lexer
// ==========================================

// Basement keyword
const KwBasement = createToken({ name: 'KwBasement', pattern: /地下/ });

// Sub-number related
const KwSubMore = createToken({ name: 'KwSubMore', pattern: /及以上附號/ });
const KwSubAll = createToken({ name: 'KwSubAll', pattern: /含附號/ });
const KwSubUnit = createToken({ name: 'KwSubUnit', pattern: /附號/ });

const KwBound = createToken({ name: 'KwBound', pattern: /以上|以下/ });
const KwAll = createToken({ name: 'KwAll', pattern: /全/ });

const To = createToken({ name: 'To', pattern: /至/ });
const Sub = createToken({ name: 'Sub', pattern: /之/ });
const Unit = createToken({ name: 'Unit', pattern: /巷|弄|號|樓/ });
const Modifier = createToken({ name: 'Modifier', pattern: /單|雙|連/ });
const Integer = createToken({ name: 'Integer', pattern: /[0-9]+/ });
const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });

const allTokens = [WhiteSpace, KwSubMore, KwSubAll, KwSubUnit, KwBasement, KwAll, KwBound, To, Sub, Unit, Modifier, Integer];

const AddressLexer = new Lexer(allTokens);

// ==========================================
// 3. Parser
// ==========================================

class AddressParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  public addressRule = this.RULE('addressRule', () => {
    this.OR([{ ALT: () => this.CONSUME(KwAll) }, { ALT: () => this.AT_LEAST_ONE(() => this.SUBRULE(this.segment)) }]);
  });

  public segment = this.RULE('segment', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Modifier);
          this.OR2([
            { ALT: () => this.CONSUME(KwAll) },
            {
              ALT: () => {
                this.SUBRULE(this.expression);
                this.SUBRULE(this.suffixOption);
              },
            },
          ]);
        },
      },
      {
        ALT: () => {
          this.SUBRULE2(this.expression);
          this.SUBRULE2(this.suffixOption);
        },
      },
    ]);
  });

  public suffixOption = this.RULE('suffixOption', () => {
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(KwSubMore) },
        {
          ALT: () => {
            this.CONSUME(KwSubAll);
            this.OPTION2(() => this.CONSUME(KwBound));
          },
        },
        { ALT: () => this.CONSUME2(KwBound) },
        { ALT: () => this.CONSUME(KwAll) },
      ]);
    });
  });

  public expression = this.RULE('expression', () => {
    this.SUBRULE(this.value, { LABEL: 'start' });
    this.OPTION(() => {
      this.CONSUME(To);
      this.SUBRULE2(this.value, { LABEL: 'end' });
    });
  });

  public value = this.RULE('value', () => {
    this.SUBRULE(this.number);
    this.OPTION(() => {
      this.OR([{ ALT: () => this.CONSUME(Unit) }, { ALT: () => this.CONSUME(KwSubUnit) }]);
    });
  });

  public number = this.RULE('number', () => {
    this.OR([
      {
        ALT: () => {
          this.OPTION(() => this.CONSUME(KwBasement));
          this.CONSUME(Integer, { LABEL: 'main' });
          this.OPTION2(() => {
            this.CONSUME(Sub);
            this.CONSUME2(Integer, { LABEL: 'sub' });
          });
        },
      },
      {
        ALT: () => {
          this.CONSUME2(Sub);
          this.CONSUME3(Integer, { LABEL: 'sub' });
        },
      },
    ]);
  });
}

const parser = new AddressParser();
const BaseCstVisitor = parser.getBaseCstVisitorConstructor();

// ==========================================
// 4. Visitor
// ==========================================

class AddressVisitor extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  addressRule(ctx: any): ASTSegment[] {
    if (ctx.KwAll) return [];
    return ctx.segment.map((segNode: any) => this.visit(segNode));
  }

  segment(ctx: any): ASTSegment {
    let modifier = ctx.Modifier ? ctx.Modifier[0].image : undefined;

    if (modifier === '單') modifier = 'odd';
    else if (modifier === '雙') modifier = 'even';
    else if (modifier === '連') modifier = undefined;

    if (ctx.Modifier && !ctx.expression) {
      return { modifier, op: 'parity_all' };
    }

    const expr = this.visit(ctx.expression);
    const suffixInfo = this.visit(ctx.suffixOption);

    let op = expr.op;
    if (suffixInfo.op) {
      op = suffixInfo.op;
    }

    return {
      modifier,
      op,
      subMode: suffixInfo.subMode,
      start: expr.start,
      end: expr.end,
    };
  }

  suffixOption(ctx: any) {
    let op: string | undefined;
    let subMode: 'all' | 'more' | undefined;

    if (ctx.KwSubMore) {
      subMode = 'more';
    } else if (ctx.KwSubAll) {
      subMode = 'all';
      if (ctx.KwBound) {
        const bound = ctx.KwBound[0].image;
        if (bound === '以上') op = 'min';
        else if (bound === '以下') op = 'max';
      }
    } else if (ctx.KwBound) {
      const bound = ctx.KwBound[0].image;
      if (bound === '以上') op = 'min';
      else if (bound === '以下') op = 'max';
    }

    return { op, subMode };
  }

  expression(ctx: any) {
    const start = this.visit(ctx.start);
    if (ctx.end) {
      const end = this.visit(ctx.end);
      return { op: 'range', start, end };
    }
    return { op: 'exact', start };
  }

  value(ctx: any): NumberValue {
    const num = this.visit(ctx.number);
    let unit = undefined;
    if (ctx.Unit) unit = ctx.Unit[0].image;
    if (ctx.KwSubUnit) unit = '附號';
    return { ...num, unit };
  }

  number(ctx: any) {
    let main: number | null = null;
    let sub: number | null = null;

    if (ctx.main) {
      main = parseInt(ctx.main[0].image, 10);

      // Convert "Basement" to negative
      if (ctx.KwBasement) {
        main = -main;
      }
    }

    if (ctx.sub) sub = parseInt(ctx.sub[0].image, 10);
    return { main, sub };
  }
}

const visitor = new AddressVisitor();

// ==========================================
// 5. Transformer
// ==========================================

class Transformer {
  public transform(ast: ASTSegment[]): AddressRule[] {
    const result: AddressRule[] = [];
    let pathValues: number[] = [];

    for (const node of ast) {
      const { op, modifier, start, end, subMode } = node;

      if (op === 'parity_all') {
        if (pathValues.length > 0) {
          this.flushPathValues(result, pathValues);
          pathValues = [];
        }
        const rule: AddressRule = {};
        if (modifier) rule.parity = modifier;
        result.push(rule);
        continue;
      }

      if (!start) continue;

      const startArr = this.numToArray(start);
      const endArr = end ? this.numToArray(end) : [];

      // Special handling for "And Above Sub-number"
      if (subMode === 'more' && op === 'exact' && start.main !== null && start.sub !== null) {
        pathValues.push(start.main);
        this.flushPathValues(result, pathValues);
        pathValues = [];
        result.push({ min: [start.sub] });
        continue;
      }

      // Fill missing values
      if (op === 'range' && end && end.main === null && start.main !== null) {
        endArr.unshift(start.main);
      }

      // Collect path values
      if (op === 'exact' && !modifier) {
        pathValues.push(...startArr);
        continue;
      }

      // Flush Path
      if (pathValues.length > 0) {
        this.flushPathValues(result, pathValues);
        pathValues = [];
      }

      // Prefix compression
      const prefix: number[] = [];
      if (op === 'range') {
        while (startArr.length > 0 && endArr.length > 0 && startArr[0] === endArr[0]) {
          prefix.push(startArr.shift()!);
          endArr.shift();
        }
      }

      if (prefix.length > 0) {
        if (result.length > 0 && this.isPureValueNode(result[result.length - 1])) {
          result[result.length - 1].value!.push(...prefix);
        } else {
          result.push({ value: prefix });
        }
      }

      const rule: AddressRule = {};
      if (modifier) rule.parity = modifier;

      if (op === 'range') {
        if (startArr.length > 0) rule.min = startArr;
        if (endArr.length > 0) rule.max = endArr;
      } else if (op === 'min') {
        if (startArr.length > 0) rule.min = startArr;
      } else if (op === 'max') {
        if (startArr.length > 0) rule.max = startArr;
      } else {
        if (startArr.length > 0) {
          rule.min = [...startArr];
          rule.max = [...startArr];
        }
      }

      result.push(rule);
    }

    if (pathValues.length > 0) {
      this.flushPathValues(result, pathValues);
    }

    return result;
  }

  private flushPathValues(result: AddressRule[], values: number[]) {
    if (result.length > 0 && this.isPureValueNode(result[result.length - 1])) {
      result[result.length - 1].value!.push(...values);
    } else {
      result.push({ value: [...values] });
    }
  }

  private isPureValueNode(node: AddressRule): boolean {
    return !!node.value && !node.min && !node.max && !node.parity;
  }

  private numToArray(nv: NumberValue): number[] {
    const arr: number[] = [];
    if (nv.main !== null) arr.push(nv.main);
    if (nv.sub !== null) arr.push(nv.sub);
    return arr;
  }
}

const transformer = new Transformer();

// ==========================================
// 6. Main Entry
// ==========================================

export function parseAddress(inputText: string, logAst: boolean = false): AddressRule[] {
  const lexingResult = AddressLexer.tokenize(inputText);
  if (lexingResult.errors.length > 0) {
    throw new Error(`Lexing errors: ${lexingResult.errors[0].message}`);
  }

  parser.input = lexingResult.tokens;
  const cst = parser.addressRule();

  if (parser.errors.length > 0) {
    throw new Error(`Parsing errors: ${parser.errors[0].message}`);
  }

  const ast = visitor.visit(cst);

  if (logAst) {
    console.log(`\x1b[36m[AST Debug] "${inputText}":\x1b[0m`);
    console.log(JSON.stringify(ast, null, 2));
  }

  return transformer.transform(ast);
}
