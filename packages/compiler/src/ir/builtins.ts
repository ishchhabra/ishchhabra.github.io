import type { TPrimitiveValue } from "./ops/prim/Literal";

/**
 * Sentinel returned from {@link BuiltinSpec.evaluate} when the
 * inputs are out-of-domain for compile-time folding (e.g., an arg
 * isn't a primitive, or the builtin would throw). Distinct from a
 * legitimate `undefined` result.
 */
export const UNRESOLVED: unique symbol = Symbol("unresolved");

/**
 * Coarse memory-region descriptor for builtin arg-relative effects.
 *
 * - `"none"` — touches no memory in this region.
 * - `"args"` — touches memory reachable from the call's argument
 *   values. `CallExpressionOp.getMemoryEffects` lowers this to
 *   concrete `computedProperty` locations on each arg.
 * - `"unknown"` — touches arbitrary memory (alias barrier).
 */
export type BuiltinRegion = "none" | "args" | "unknown";

/**
 * Five-axis effect record for a named builtin. Mirrors the on-op
 * effects model in `Operation`. `CallExpressionOp` consults this
 * per-axis when its callee resolves to a builtin name; ops not in
 * the table are treated opaquely (every axis pessimistic).
 */
export interface BuiltinEffects {
  readonly reads: BuiltinRegion;
  readonly writes: BuiltinRegion;
  readonly mayThrow: boolean;
  readonly mayDiverge: boolean;
  readonly isDeterministic: boolean;
  readonly isObservable: boolean;
}

/**
 * Static facts about a named JavaScript runtime builtin. Populated
 * once, queried by many passes. Not a transform — pure data.
 *
 * The `effects` field is the per-builtin five-axis record consumed
 * by `CallExpressionOp` to populate its own axes. The `evaluate`
 * field is independent — it answers "can this call be folded at
 * compile time when all args are constants?" Constant propagation
 * asks this. Only set when the builtin is pure, deterministic,
 * total over its typed domain, and cheap enough to evaluate at
 * compile time. `JSON.parse` with a huge string arg is
 * pure+deterministic but intentionally not folded.
 */
export interface BuiltinSpec {
  /** Dotted qualified name: "Math.sqrt", "Number.isFinite", "console.log". */
  readonly name: string;

  /** Five-axis effects record. */
  readonly effects: BuiltinEffects;

  /** Compile-time arity guard used before calling {@link evaluate}. */
  readonly arity:
    | { kind: "exact"; n: number }
    | { kind: "atMost"; n: number }
    | { kind: "variadic"; min?: number; max?: number };

  /**
   * Compile-time evaluator. Present iff the builtin is pure,
   * deterministic, total over its typed domain, and cheap enough
   * to run at compile time. Return {@link UNRESOLVED} to decline a
   * specific evaluation (e.g. `parseInt("x")` → NaN, declined).
   */
  readonly evaluate?: (...args: TPrimitiveValue[]) => TPrimitiveValue | typeof UNRESOLVED;
}

// ---------------------------------------------------------------------------
// Effect presets
// ---------------------------------------------------------------------------

/**
 * "Pure, deterministic, all-clean" — the canonical preset for math /
 * coercion / parse helpers. No memory access, no throws, no
 * divergence, deterministic, not observable.
 */
const PURE_DET_EFFECTS: BuiltinEffects = {
  reads: "none",
  writes: "none",
  mayThrow: false,
  mayDiverge: false,
  isDeterministic: true,
  isObservable: false,
};

/**
 * "Pure but non-deterministic" — `Math.random`, `Date.now`,
 * `performance.now`. Safe to delete when unused (no writes, no
 * throw, not observable) but cannot be folded or duplicated.
 */
const PURE_NONDET_EFFECTS: BuiltinEffects = {
  reads: "none",
  writes: "none",
  mayThrow: false,
  mayDiverge: false,
  isDeterministic: false,
  isObservable: false,
};

/**
 * `console.*` — no memory, no throws, but externally observable
 * (DCE must keep them).
 */
const OBSERVABLE_EFFECTS: BuiltinEffects = {
  reads: "none",
  writes: "none",
  mayThrow: false,
  mayDiverge: false,
  isDeterministic: true,
  isObservable: true,
};

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

type ArityKind = BuiltinSpec["arity"];

function exact(n: number): ArityKind {
  return { kind: "exact", n };
}
function atMost(n: number): ArityKind {
  return { kind: "atMost", n };
}
function variadic(range?: { min?: number; max?: number }): ArityKind {
  return { kind: "variadic", ...(range ?? {}) };
}

/** Constant-valued globals: `undefined`, `Infinity`, `NaN`. */
export const BUILTIN_GLOBAL_CONSTANTS: ReadonlyMap<string, TPrimitiveValue> = new Map([
  ["undefined", undefined],
  ["Infinity", Infinity],
  ["NaN", NaN],
]);

/** Constant-valued static properties: `Math.PI`, `Number.EPSILON`, etc. */
export const BUILTIN_STATIC_CONSTANTS: ReadonlyMap<string, TPrimitiveValue> = new Map([
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

type Evaluator = NonNullable<BuiltinSpec["evaluate"]>;

const SPECS = new Map<string, BuiltinSpec>();

function define(names: readonly string[], props: Omit<BuiltinSpec, "name">): void {
  for (const name of names) {
    SPECS.set(name, { name, ...props });
  }
}

// --- Pure, deterministic, foldable math / number / string helpers ---------

function pureDet(arity: ArityKind, evaluate: Evaluator): Omit<BuiltinSpec, "name"> {
  return { effects: PURE_DET_EFFECTS, arity, evaluate };
}

define(["Boolean"], pureDet(atMost(1), (x) => Boolean(x)));
define(["Number"], pureDet(atMost(1), (x) => Number(x)));
define(["String"], pureDet(atMost(1), (x) => String(x)));
define(["BigInt"], pureDet(exact(1), (x) => BigInt(x as string | number | bigint | boolean)));

define(["Array.isArray"], pureDet(exact(1), (x) => Array.isArray(x)));
define(["Object.is"], pureDet(exact(2), (a, b) => Object.is(a, b)));

define(["isFinite"], pureDet(exact(1), (x) => isFinite(x as number)));
define(["isNaN"], pureDet(exact(1), (x) => isNaN(x as number)));
define(["parseFloat", "Number.parseFloat"], pureDet(exact(1), (x) => parseFloat(String(x))));
define(["parseInt", "Number.parseInt"], pureDet(variadic({ min: 1, max: 2 }), (...args) => {
  const [input, radix] = args;
  return radix === undefined ? parseInt(String(input)) : parseInt(String(input), Number(radix));
}));

define(["encodeURI"], pureDet(exact(1), (x) => encodeURI(String(x))));
define(["encodeURIComponent"], pureDet(exact(1), (x) => encodeURIComponent(String(x))));
define(["decodeURI"], pureDet(exact(1), (x) => decodeURI(String(x))));
define(["decodeURIComponent"], pureDet(exact(1), (x) => decodeURIComponent(String(x))));

define(["Date.parse"], pureDet(exact(1), (x) => Date.parse(String(x))));
define(["Date.UTC"], pureDet(variadic({ min: 2, max: 7 }), (...args) => {
  const v = args.map((a) => Number(a));
  switch (v.length) {
    case 2:
      return Date.UTC(v[0], v[1]);
    case 3:
      return Date.UTC(v[0], v[1], v[2]);
    case 4:
      return Date.UTC(v[0], v[1], v[2], v[3]);
    case 5:
      return Date.UTC(v[0], v[1], v[2], v[3], v[4]);
    case 6:
      return Date.UTC(v[0], v[1], v[2], v[3], v[4], v[5]);
    case 7:
      return Date.UTC(v[0], v[1], v[2], v[3], v[4], v[5], v[6]);
    default:
      return UNRESOLVED;
  }
}));

define(["JSON.stringify"], pureDet(variadic({ min: 1, max: 3 }), (...args) => {
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
}));
define(["JSON.parse"], pureDet(exact(1), (x) => JSON.parse(String(x))));

define(["Number.isFinite"], pureDet(exact(1), (x) => Number.isFinite(x)));
define(["Number.isInteger"], pureDet(exact(1), (x) => Number.isInteger(x)));
define(["Number.isNaN"], pureDet(exact(1), (x) => Number.isNaN(x)));
define(["Number.isSafeInteger"], pureDet(exact(1), (x) => Number.isSafeInteger(x)));

// Math — all pure, deterministic.
const MATH_UNARY: Array<[string, (n: number) => number]> = [
  ["abs", Math.abs],
  ["acos", Math.acos],
  ["acosh", Math.acosh],
  ["asin", Math.asin],
  ["asinh", Math.asinh],
  ["atan", Math.atan],
  ["atanh", Math.atanh],
  ["cbrt", Math.cbrt],
  ["ceil", Math.ceil],
  ["clz32", Math.clz32],
  ["cos", Math.cos],
  ["cosh", Math.cosh],
  ["exp", Math.exp],
  ["expm1", Math.expm1],
  ["floor", Math.floor],
  ["fround", Math.fround],
  ["log", Math.log],
  ["log1p", Math.log1p],
  ["log10", Math.log10],
  ["log2", Math.log2],
  ["round", Math.round],
  ["sign", Math.sign],
  ["sin", Math.sin],
  ["sinh", Math.sinh],
  ["sqrt", Math.sqrt],
  ["tan", Math.tan],
  ["tanh", Math.tanh],
  ["trunc", Math.trunc],
];
for (const [method, fn] of MATH_UNARY) {
  define([`Math.${method}`], pureDet(exact(1), (x) => fn(Number(x))));
}
define(["Math.imul"], pureDet(exact(2), (a, b) => Math.imul(Number(a), Number(b))));
define(["Math.pow"], pureDet(exact(2), (a, b) => Math.pow(Number(a), Number(b))));
define(["Math.max"], pureDet(variadic(), (...args) => Math.max(...args.map(Number))));
define(["Math.min"], pureDet(variadic(), (...args) => Math.min(...args.map(Number))));
define(["Math.hypot"], pureDet(variadic(), (...args) => Math.hypot(...args.map(Number))));
define(["Math.atan2"], pureDet(exact(2), (a, b) => Math.atan2(Number(a), Number(b))));

define(["String.fromCharCode"], pureDet(variadic(), (...args) =>
  String.fromCharCode(...args.map(Number)),
));
define(["String.fromCodePoint"], pureDet(variadic(), (...args) =>
  String.fromCodePoint(...args.map(Number)),
));

define(["BigInt.asIntN"], pureDet(exact(2), (bits, value) =>
  BigInt.asIntN(Number(bits), BigInt(value as string | number | bigint | boolean)),
));
define(["BigInt.asUintN"], pureDet(exact(2), (bits, value) =>
  BigInt.asUintN(Number(bits), BigInt(value as string | number | bigint | boolean)),
));

// --- Pure but non-deterministic: safe to DELETE if unused, not to FOLD ---

define(["Math.random"], { effects: PURE_NONDET_EFFECTS, arity: exact(0) });
define(["Date.now"], { effects: PURE_NONDET_EFFECTS, arity: exact(0) });
define(["performance.now"], { effects: PURE_NONDET_EFFECTS, arity: exact(0) });

// --- Observably side-effectful: must not be touched ----------------------

for (const name of ["log", "warn", "error", "info", "debug", "trace"]) {
  define([`console.${name}`], { effects: OBSERVABLE_EFFECTS, arity: variadic() });
}

// ---------------------------------------------------------------------------
// Public query surface
// ---------------------------------------------------------------------------

export const BUILTIN_SPECS: ReadonlyMap<string, BuiltinSpec> = SPECS;

/** Fetch the spec for a qualified name, or `undefined` if not a known builtin. */
export function lookupBuiltin(name: string): BuiltinSpec | undefined {
  return SPECS.get(name);
}

/**
 * Is this builtin safe to delete when its result is unused? (DCE
 * predicate.) A builtin qualifies when it has no writes, doesn't
 * throw, and isn't observable — independent of determinism.
 */
export function isPureBuiltin(spec: BuiltinSpec | undefined): boolean {
  if (spec === undefined) return false;
  const e = spec.effects;
  return e.writes === "none" && !e.mayThrow && !e.isObservable;
}

/**
 * Is this builtin foldable right now given these arg counts? (CP predicate.)
 * Checks effect-purity + determinism + arity match + presence of `evaluate`.
 * Doesn't run the evaluator — caller must ensure args are all constants
 * and then call `spec.evaluate(...args)`.
 */
export function canFoldBuiltin(spec: BuiltinSpec | undefined, argCount: number): boolean {
  if (spec === undefined) return false;
  const e = spec.effects;
  if (e.writes !== "none" || e.mayThrow || e.isObservable) return false;
  if (!e.isDeterministic) return false;
  if (spec.evaluate === undefined) return false;
  return matchesArity(spec.arity, argCount);
}

function matchesArity(arity: ArityKind, argCount: number): boolean {
  switch (arity.kind) {
    case "exact":
      return argCount === arity.n;
    case "atMost":
      return argCount <= arity.n;
    case "variadic":
      if (arity.min !== undefined && argCount < arity.min) return false;
      if (arity.max !== undefined && argCount > arity.max) return false;
      return true;
  }
}
