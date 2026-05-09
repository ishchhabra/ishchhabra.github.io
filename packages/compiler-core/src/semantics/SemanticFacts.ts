import { OperationEffects } from "../ir/effects";
import { ConstantValue } from "../ir/ops/constants/ConstantOp";

export const UnresolvedSemanticFact: unique symbol = Symbol("unresolved-semantic-fact");

export type PrimitiveKind =
  | "undefined"
  | "null"
  | "boolean"
  | "number"
  | "string"
  | "bigint"
  | "symbol"
  | "object"
  | "function";

export type ValueFact =
  | { readonly kind: "pending" }
  | { readonly kind: "unknown" }
  | { readonly kind: "constant"; readonly value: ConstantValue }
  | { readonly kind: "intrinsic"; readonly name: string; readonly primitive: PrimitiveKind };

export interface CallSemanticFact {
  readonly result: ValueFact;
  readonly effects?: OperationEffects;
}

export interface SemanticFactsProvider {
  resolveGlobal?(name: string): ValueFact | undefined;
  resolveStaticProperty?(base: ValueFact, key: string): ValueFact | undefined;
  evaluateCall?(target: ValueFact, args: readonly ValueFact[]): CallSemanticFact | undefined;
}

export const PendingFact: ValueFact = Object.freeze({ kind: "pending" });
export const UnknownFact: ValueFact = Object.freeze({ kind: "unknown" });

export function constantFact(value: ConstantValue): ValueFact {
  return { kind: "constant", value };
}

export function intrinsicFact(name: string, primitive: PrimitiveKind = "object"): ValueFact {
  return { kind: "intrinsic", name, primitive };
}

export function sameValueFact(left: ValueFact, right: ValueFact): boolean {
  if (left.kind !== right.kind) return false;

  if (left.kind === "constant" && right.kind === "constant") {
    return Object.is(left.value, right.value);
  }

  if (left.kind === "intrinsic" && right.kind === "intrinsic") {
    return left.name === right.name && left.primitive === right.primitive;
  }

  return true;
}

export function meetValueFacts(left: ValueFact, right: ValueFact): ValueFact {
  if (left.kind === "pending") return right;
  if (right.kind === "pending") return left;
  return sameValueFact(left, right) ? left : UnknownFact;
}

export function factTruthiness(fact: ValueFact): true | false | "pending" | "unknown" {
  if (fact.kind === "pending") return "pending";
  if (fact.kind !== "constant") return "unknown";
  return Boolean(fact.value);
}

export function constantValueOf(fact: ValueFact): ConstantValue | undefined {
  return fact.kind === "constant" ? fact.value : undefined;
}

export function hasConstantValue(
  fact: ValueFact,
): fact is Extract<ValueFact, { kind: "constant" }> {
  return fact.kind === "constant";
}
