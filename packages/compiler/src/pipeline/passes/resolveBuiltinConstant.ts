import { ModuleIR } from "../../ir/core/ModuleIR";
import {
  Operation,
  CallExpressionOp,
  LoadGlobalOp,
  LoadStaticPropertyOp,
  TPrimitiveValue,
} from "../../ir";
import { ResolveConstantContext, getQualifiedName } from "./resolveConstant";

const UNRESOLVED = Symbol("unresolved");

type ResolveResult = TPrimitiveValue | typeof UNRESOLVED;
type PureBuiltinEvaluator = (args: readonly TPrimitiveValue[]) => ResolveResult;

const BUILTIN_GLOBAL_CONSTANTS = new Map<string, TPrimitiveValue>([
  ["undefined", undefined],
  ["Infinity", Infinity],
  ["NaN", NaN],
]);

const BUILTIN_STATIC_CONSTANTS = new Map<string, TPrimitiveValue>([
  ["Math.E", Math.E],
  ["Math.LN10", Math.LN10],
  ["Math.LN2", Math.LN2],
  ["Math.LOG10E", Math.LOG10E],
  ["Math.LOG2E", Math.LOG2E],
  ["Math.PI", Math.PI],
  ["Math.SQRT1_2", Math.SQRT1_2],
  ["Math.SQRT2", Math.SQRT2],
  ["Number.EPSILON", Number.EPSILON],
  ["Number.MAX_SAFE_INTEGER", Number.MAX_SAFE_INTEGER],
  ["Number.MAX_VALUE", Number.MAX_VALUE],
  ["Number.MIN_SAFE_INTEGER", Number.MIN_SAFE_INTEGER],
  ["Number.MIN_VALUE", Number.MIN_VALUE],
  ["Number.NaN", Number.NaN],
  ["Number.NEGATIVE_INFINITY", Number.NEGATIVE_INFINITY],
  ["Number.POSITIVE_INFINITY", Number.POSITIVE_INFINITY],
]);

const PURE_BUILTIN_CALLS = new Map<string, PureBuiltinEvaluator>();

registerAliases(
  ["Boolean"],
  variadicAtMost(1, (args) => Boolean(args[0])),
);
registerAliases(
  ["Number"],
  variadicAtMost(1, (args) => Number(args[0])),
);
registerAliases(
  ["String"],
  variadicAtMost(1, (args) => String(args[0])),
);
registerAliases(
  ["BigInt"],
  exactArity(1, (value) => BigInt(value as string | number | bigint | boolean)),
);
registerAliases(
  ["Array.isArray"],
  exactArity(1, (value) => Array.isArray(value)),
);
registerAliases(["Object.is"], exactArity(2, Object.is));
registerAliases(
  ["isFinite"],
  exactArity(1, (value) => isFinite(value as any)),
);
registerAliases(
  ["isNaN"],
  exactArity(1, (value) => isNaN(value as any)),
);
registerAliases(
  ["parseFloat", "Number.parseFloat"],
  exactArity(1, (value) => parseFloat(String(value))),
);
registerAliases(
  ["parseInt", "Number.parseInt"],
  rangeArity(1, 2, (args) => {
    const [input, radix] = args;
    return radix === undefined ? parseInt(String(input)) : parseInt(String(input), Number(radix));
  }),
);
registerAliases(
  ["encodeURI"],
  exactArity(1, (value) => encodeURI(String(value))),
);
registerAliases(
  ["encodeURIComponent"],
  exactArity(1, (value) => encodeURIComponent(String(value))),
);
registerAliases(
  ["decodeURI"],
  exactArity(1, (value) => decodeURI(String(value))),
);
registerAliases(
  ["decodeURIComponent"],
  exactArity(1, (value) => decodeURIComponent(String(value))),
);
registerAliases(
  ["Date.parse"],
  exactArity(1, (value) => Date.parse(String(value))),
);
registerAliases(
  ["Date.UTC"],
  rangeArity(2, 7, (args) => {
    const values = args.map((arg) => Number(arg));
    switch (values.length) {
      case 2:
        return Date.UTC(values[0], values[1]);
      case 3:
        return Date.UTC(values[0], values[1], values[2]);
      case 4:
        return Date.UTC(values[0], values[1], values[2], values[3]);
      case 5:
        return Date.UTC(values[0], values[1], values[2], values[3], values[4]);
      case 6:
        return Date.UTC(values[0], values[1], values[2], values[3], values[4], values[5]);
      case 7:
        return Date.UTC(
          values[0],
          values[1],
          values[2],
          values[3],
          values[4],
          values[5],
          values[6],
        );
      default:
        return UNRESOLVED;
    }
  }),
);
registerAliases(
  ["JSON.stringify"],
  rangeArity(1, 3, (args) => {
    switch (args.length) {
      case 1:
        return JSON.stringify(args[0]);
      case 2:
        return JSON.stringify(args[0], args[1] as (string | number)[] | null | undefined);
      case 3:
        return JSON.stringify(
          args[0],
          args[1] as (string | number)[] | null | undefined,
          args[2] as string | number | undefined,
        );
      default:
        return UNRESOLVED;
    }
  }),
);
registerAliases(
  ["JSON.parse"],
  exactArity(1, (value) => JSON.parse(String(value))),
);
registerAliases(
  ["Number.isFinite"],
  exactArity(1, (value) => Number.isFinite(value)),
);
registerAliases(
  ["Number.isInteger"],
  exactArity(1, (value) => Number.isInteger(value)),
);
registerAliases(
  ["Number.isNaN"],
  exactArity(1, (value) => Number.isNaN(value)),
);
registerAliases(
  ["Number.isSafeInteger"],
  exactArity(1, (value) => Number.isSafeInteger(value)),
);
registerAliases(
  ["Math.abs"],
  exactArity(1, (value) => Math.abs(Number(value))),
);
registerAliases(
  ["Math.acos"],
  exactArity(1, (value) => Math.acos(Number(value))),
);
registerAliases(
  ["Math.acosh"],
  exactArity(1, (value) => Math.acosh(Number(value))),
);
registerAliases(
  ["Math.asin"],
  exactArity(1, (value) => Math.asin(Number(value))),
);
registerAliases(
  ["Math.asinh"],
  exactArity(1, (value) => Math.asinh(Number(value))),
);
registerAliases(
  ["Math.atan"],
  exactArity(1, (value) => Math.atan(Number(value))),
);
registerAliases(
  ["Math.atanh"],
  exactArity(1, (value) => Math.atanh(Number(value))),
);
registerAliases(
  ["Math.cbrt"],
  exactArity(1, (value) => Math.cbrt(Number(value))),
);
registerAliases(
  ["Math.ceil"],
  exactArity(1, (value) => Math.ceil(Number(value))),
);
registerAliases(
  ["Math.clz32"],
  exactArity(1, (value) => Math.clz32(Number(value))),
);
registerAliases(
  ["Math.cos"],
  exactArity(1, (value) => Math.cos(Number(value))),
);
registerAliases(
  ["Math.cosh"],
  exactArity(1, (value) => Math.cosh(Number(value))),
);
registerAliases(
  ["Math.exp"],
  exactArity(1, (value) => Math.exp(Number(value))),
);
registerAliases(
  ["Math.expm1"],
  exactArity(1, (value) => Math.expm1(Number(value))),
);
registerAliases(
  ["Math.floor"],
  exactArity(1, (value) => Math.floor(Number(value))),
);
registerAliases(
  ["Math.fround"],
  exactArity(1, (value) => Math.fround(Number(value))),
);
registerAliases(
  ["Math.imul"],
  exactArity(2, (a, b) => Math.imul(Number(a), Number(b))),
);
registerAliases(
  ["Math.log"],
  exactArity(1, (value) => Math.log(Number(value))),
);
registerAliases(
  ["Math.log1p"],
  exactArity(1, (value) => Math.log1p(Number(value))),
);
registerAliases(
  ["Math.log10"],
  exactArity(1, (value) => Math.log10(Number(value))),
);
registerAliases(
  ["Math.log2"],
  exactArity(1, (value) => Math.log2(Number(value))),
);
registerAliases(
  ["Math.max"],
  variadic((args) => Math.max(...args.map(Number))),
);
registerAliases(
  ["Math.min"],
  variadic((args) => Math.min(...args.map(Number))),
);
registerAliases(
  ["Math.pow"],
  exactArity(2, (a, b) => Math.pow(Number(a), Number(b))),
);
registerAliases(
  ["Math.round"],
  exactArity(1, (value) => Math.round(Number(value))),
);
registerAliases(
  ["Math.sign"],
  exactArity(1, (value) => Math.sign(Number(value))),
);
registerAliases(
  ["Math.sin"],
  exactArity(1, (value) => Math.sin(Number(value))),
);
registerAliases(
  ["Math.sinh"],
  exactArity(1, (value) => Math.sinh(Number(value))),
);
registerAliases(
  ["Math.sqrt"],
  exactArity(1, (value) => Math.sqrt(Number(value))),
);
registerAliases(
  ["Math.tan"],
  exactArity(1, (value) => Math.tan(Number(value))),
);
registerAliases(
  ["Math.tanh"],
  exactArity(1, (value) => Math.tanh(Number(value))),
);
registerAliases(
  ["Math.trunc"],
  exactArity(1, (value) => Math.trunc(Number(value))),
);
registerAliases(
  ["Math.hypot"],
  variadic((args) => Math.hypot(...args.map(Number))),
);
registerAliases(
  ["String.fromCharCode"],
  variadic((args) => String.fromCharCode(...args.map(Number))),
);
registerAliases(
  ["String.fromCodePoint"],
  variadic((args) => String.fromCodePoint(...args.map(Number))),
);
registerAliases(
  ["BigInt.asIntN"],
  exactArity(2, (bits, value) => BigInt.asIntN(Number(bits), BigInt(value as any))),
);
registerAliases(
  ["BigInt.asUintN"],
  exactArity(2, (bits, value) => BigInt.asUintN(Number(bits), BigInt(value as any))),
);

export function resolveBuiltinConstant(
  instruction: Operation,
  moduleIR: ModuleIR,
  ctx: ResolveConstantContext,
): void {
  if (instruction instanceof LoadGlobalOp) {
    if (moduleIR.globals.get(instruction.name)?.kind === "import") {
      return;
    }

    const value = BUILTIN_GLOBAL_CONSTANTS.get(instruction.name);
    if (value !== undefined || BUILTIN_GLOBAL_CONSTANTS.has(instruction.name)) {
      ctx.set(value);
    }
    return;
  }

  if (instruction instanceof LoadStaticPropertyOp) {
    const qualifiedName = getQualifiedName(instruction, ctx.environment);
    if (qualifiedName === undefined || !isBuiltinRoot(qualifiedName, moduleIR)) {
      return;
    }

    const value = BUILTIN_STATIC_CONSTANTS.get(qualifiedName);
    if (value !== undefined || BUILTIN_STATIC_CONSTANTS.has(qualifiedName)) {
      ctx.set(value);
    }
    return;
  }

  if (!(instruction instanceof CallExpressionOp)) {
    return;
  }

  const calleeInstruction = instruction.callee.definer as Operation | undefined;
  if (calleeInstruction === undefined) {
    return;
  }

  const qualifiedName = getQualifiedName(calleeInstruction, ctx.environment);
  if (qualifiedName === undefined || !isBuiltinRoot(qualifiedName, moduleIR)) {
    return;
  }

  const evaluator = PURE_BUILTIN_CALLS.get(qualifiedName);
  if (evaluator === undefined) {
    return;
  }

  const args: TPrimitiveValue[] = [];
  for (const arg of instruction.args) {
    const constant = ctx.get(arg);
    if (constant === undefined && !ctx.has(arg)) {
      return;
    }
    args.push(constant);
  }

  const value = evaluator(args);
  if (value !== UNRESOLVED) {
    ctx.set(value);
  }
}

function isBuiltinRoot(qualifiedName: string, moduleIR: ModuleIR): boolean {
  const rootName = qualifiedName.split(".", 1)[0];
  return moduleIR.globals.get(rootName)?.kind !== "import";
}

function registerAliases(names: readonly string[], evaluator: PureBuiltinEvaluator): void {
  for (const name of names) {
    PURE_BUILTIN_CALLS.set(name, evaluator);
  }
}

function exactArity(
  expected: number,
  fn: (...args: TPrimitiveValue[]) => unknown,
): PureBuiltinEvaluator {
  return (args) => {
    if (args.length !== expected) return UNRESOLVED;
    return evaluatePrimitive(() => fn(...args));
  };
}

function variadic(fn: (args: readonly TPrimitiveValue[]) => unknown): PureBuiltinEvaluator {
  return (args) => evaluatePrimitive(() => fn(args));
}

function variadicAtMost(
  maxArgs: number,
  fn: (args: readonly TPrimitiveValue[]) => unknown,
): PureBuiltinEvaluator {
  return (args) => {
    if (args.length > maxArgs) return UNRESOLVED;
    return evaluatePrimitive(() => fn(args));
  };
}

function rangeArity(
  minArgs: number,
  maxArgs: number,
  fn: (args: readonly TPrimitiveValue[]) => unknown,
): PureBuiltinEvaluator {
  return (args) => {
    if (args.length < minArgs || args.length > maxArgs) return UNRESOLVED;
    return evaluatePrimitive(() => fn(args));
  };
}

function evaluatePrimitive(fn: () => unknown): ResolveResult {
  try {
    const value = fn();
    return isFoldablePrimitive(value) ? value : UNRESOLVED;
  } catch {
    return UNRESOLVED;
  }
}

function isFoldablePrimitive(value: unknown): value is Exclude<TPrimitiveValue, symbol> {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return true;
    case "symbol":
      return false;
    default:
      return value === null;
  }
}
