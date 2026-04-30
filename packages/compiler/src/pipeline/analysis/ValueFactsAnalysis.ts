import {
  BinaryExpressionOp,
  BindingDeclOp,
  BindingInitOp,
  BranchTermOp,
  JumpTermOp,
  LiteralOp,
  LoadContextOp,
  LoadLocalOp,
  LogicalExpressionOp,
  Operation,
  StoreContextOp,
  StoreLocalOp,
  TPrimitiveValue,
  UnaryExpressionOp,
  UpdateExpressionOp,
  Value,
} from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import type { DeclarationId } from "../../ir/core/Value";
import {
  successorArgValue,
  TermOp,
  type ControlFlowFacts,
  type Equality,
  type SuccessorArg,
  type Truthiness,
} from "../../ir/core/TermOp";
import { FunctionAnalysis } from "./AnalysisManager";

export type PrimitiveKind =
  | "undefined"
  | "null"
  | "boolean"
  | "string"
  | "number"
  | "bigint"
  | "symbol"
  | "object"
  | "function";

const enum TypeMask {
  None = 0,
  Undefined = 1 << 0,
  Null = 1 << 1,
  Boolean = 1 << 2,
  String = 1 << 3,
  Number = 1 << 4,
  BigInt = 1 << 5,
  Symbol = 1 << 6,
  Object = 1 << 7,
  Function = 1 << 8,
  Any = Undefined | Null | Boolean | String | Number | BigInt | Symbol | Object | Function,
}

export interface ValueFact {
  readonly typeMask: number;
  readonly constant?: TPrimitiveValue;
}

type LocalFacts = ReadonlyMap<DeclarationId, ValueFact>;

const NO_FACT: ValueFact = Object.freeze({ typeMask: TypeMask.None });
const UNKNOWN_FACT: ValueFact = Object.freeze({ typeMask: TypeMask.Any });

export class ValueFacts implements ControlFlowFacts {
  constructor(
    private readonly facts: ReadonlyMap<Value, ValueFact>,
    private readonly executableBlocks: ReadonlySet<BasicBlock>,
    private readonly localFactsBeforeOp: ReadonlyMap<Operation, LocalFacts>,
  ) {}

  fact(value: Value): ValueFact {
    return this.facts.get(value) ?? NO_FACT;
  }

  constant(value: Value): TPrimitiveValue | undefined {
    return this.fact(value).constant;
  }

  hasConstant(value: Value): boolean {
    return "constant" in this.fact(value);
  }

  mayBe(value: Value, kind: PrimitiveKind): boolean {
    return (this.fact(value).typeMask & maskForKind(kind)) !== 0;
  }

  mustBe(value: Value, kind: PrimitiveKind): boolean {
    const mask = this.fact(value).typeMask;
    const kindMask = maskForKind(kind);
    return mask !== TypeMask.None && (mask & ~kindMask) === 0;
  }

  mustBeNumber(value: Value): boolean {
    return this.mustBe(value, "number");
  }

  factBefore(op: Operation, value: Value): ValueFact {
    return this.localFactsBeforeOp.get(op)?.get(value.declarationId) ?? this.fact(value);
  }

  mustBeBefore(op: Operation, value: Value, kind: PrimitiveKind): boolean {
    const fact = this.factBefore(op, value);
    const kindMask = maskForKind(kind);
    return fact.typeMask !== TypeMask.None && (fact.typeMask & ~kindMask) === 0;
  }

  mustBeNumberBefore(op: Operation, value: Value): boolean {
    return this.mustBeBefore(op, value, "number");
  }

  mustBeBigInt(value: Value): boolean {
    return this.mustBe(value, "bigint");
  }

  mustBeString(value: Value): boolean {
    return this.mustBe(value, "string");
  }

  isExecutable(block: BasicBlock): boolean {
    return this.executableBlocks.has(block);
  }

  truthiness(value: Value): Truthiness {
    const fact = this.fact(value);
    if (fact.typeMask === TypeMask.None) return "pending";
    if ("constant" in fact) return Boolean(fact.constant);

    const canBeFalsy = mayBeFalsy(fact.typeMask);
    const canBeTruthy = mayBeTruthy(fact.typeMask);
    if (canBeFalsy && canBeTruthy) return "unknown";
    if (canBeTruthy) return true;
    if (canBeFalsy) return false;
    return "unknown";
  }

  strictEqual(left: Value, right: Value): Equality {
    const l = this.fact(left);
    const r = this.fact(right);
    if (l.typeMask === TypeMask.None || r.typeMask === TypeMask.None) return "pending";
    if ("constant" in l && "constant" in r) return l.constant === r.constant;
    if ((l.typeMask & r.typeMask) === 0) return false;
    return "unknown";
  }
}

export class ValueFactsAnalysis extends FunctionAnalysis<ValueFacts> {
  run(funcOp: FuncOp): ValueFacts {
    return new ValueFactsBuilder(funcOp).run();
  }
}

class ValueFactsBuilder implements ControlFlowFacts {
  private readonly facts = new Map<Value, ValueFact>();
  private readonly ssaWorklist: Value[] = [];
  private readonly cfgWorklist: BasicBlock[] = [];
  private readonly executableBlocks = new Set<BasicBlock>();
  private readonly executableEdges = new Set<string>();
  private readonly localBlockOut = new Map<BasicBlock, Map<DeclarationId, ValueFact>>();
  private readonly localFactsBeforeOp = new Map<Operation, Map<DeclarationId, ValueFact>>();

  constructor(private readonly funcOp: FuncOp) {}

  run(): ValueFacts {
    this.seed();
    this.drain();
    return new ValueFacts(
      new Map(this.facts),
      new Set(this.executableBlocks),
      new Map(this.localFactsBeforeOp),
    );
  }

  truthiness(value: Value): Truthiness {
    return new ValueFacts(this.facts, this.executableBlocks, this.localFactsBeforeOp).truthiness(
      value,
    );
  }

  strictEqual(left: Value, right: Value): Equality {
    return new ValueFacts(this.facts, this.executableBlocks, this.localFactsBeforeOp).strictEqual(
      left,
      right,
    );
  }

  private seed(): void {
    for (const param of this.funcOp.params) {
      this.setFact(param.value, UNKNOWN_FACT);
    }
    for (const param of this.funcOp.entryBlock.params) {
      this.setFact(param, UNKNOWN_FACT);
    }
    this.markBlockExecutable(this.funcOp.entryBlock);
  }

  private drain(): void {
    while (this.ssaWorklist.length > 0 || this.cfgWorklist.length > 0) {
      while (this.cfgWorklist.length > 0) {
        this.evaluateBlock(this.cfgWorklist.pop()!);
      }

      if (this.ssaWorklist.length === 0) continue;
      const value = this.ssaWorklist.pop()!;
      for (const user of value.users) {
        if (this.isExecutableOp(user)) this.evaluate(user);
      }
    }
  }

  private getFact(value: Value): ValueFact {
    return this.facts.get(value) ?? NO_FACT;
  }

  private setFact(value: Value, next: ValueFact): void {
    const prev = this.getFact(value);
    const joined = joinFacts(prev, next);
    if (sameFact(prev, joined)) return;
    this.facts.set(value, joined);
    this.ssaWorklist.push(value);
  }

  private evaluateBlock(block: BasicBlock): void {
    this.evaluateBlockParams(block);
    const localFacts = new Map(this.localFactsForBlockStart(block));
    for (const op of block.getAllOps()) {
      this.localFactsBeforeOp.set(op, new Map(localFacts));
      this.evaluate(op);
      this.transferLocalFacts(op, localFacts);
    }

    const prev = this.localBlockOut.get(block);
    if (prev !== undefined && sameLocalFacts(prev, localFacts)) return;

    this.localBlockOut.set(block, new Map(localFacts));
    const terminal = block.terminal;
    if (terminal === undefined) return;
    for (const i of terminal.successorIndices()) {
      if (this.executableEdges.has(this.edgeKey(block, i))) {
        this.cfgWorklist.push(terminal.target(i).block);
      }
    }
  }

  private localFactsForBlockStart(block: BasicBlock): Map<DeclarationId, ValueFact> {
    let facts = new Map<DeclarationId, ValueFact>();
    if (block === this.funcOp.entryBlock) return facts;

    for (const pred of this.funcOp.blocks) {
      const predOut = this.localBlockOut.get(pred);
      if (predOut === undefined) continue;

      const terminal = pred.terminal;
      if (terminal === undefined) continue;
      for (const i of terminal.successorIndices()) {
        if (!this.executableEdges.has(this.edgeKey(pred, i))) continue;
        if (terminal.target(i).block !== block) continue;
        facts = joinLocalFacts(facts, predOut);
      }
    }
    return facts;
  }

  private transferLocalFacts(op: Operation, facts: Map<DeclarationId, ValueFact>): void {
    if (op instanceof BindingDeclOp) {
      facts.set(op.place.declarationId, UNKNOWN_FACT);
    } else if (op instanceof StoreLocalOp) {
      const fact = this.getFact(op.value);
      facts.set(op.lval.declarationId, fact);
      facts.set(op.binding.declarationId, fact);
    } else if (op instanceof UpdateExpressionOp && op.target.kind === "local") {
      facts.set(op.target.binding.declarationId, primitiveFact(TypeMask.Number));
    }
  }

  private evaluateBlockParams(block: BasicBlock): void {
    if (block.params.length === 0) return;
    for (let i = 0; i < block.params.length; i++) {
      let fact = NO_FACT;
      for (const { args } of this.executableIncomingSuccessors(block)) {
        const arg = args[i];
        if (arg === undefined) continue;
        fact = joinFacts(fact, this.getFact(successorArgValue(arg)));
      }
      this.setFact(block.params[i], fact);
    }
  }

  private *executableIncomingSuccessors(
    block: BasicBlock,
  ): IterableIterator<{ args: readonly SuccessorArg[] }> {
    for (const pred of this.funcOp.blocks) {
      const terminal = pred.terminal;
      if (terminal === undefined) continue;
      for (const i of terminal.successorIndices()) {
        if (!this.executableEdges.has(this.edgeKey(pred, i))) continue;
        const successor = terminal.target(i);
        if (successor.block === block) yield { args: successor.args };
      }
    }
  }

  private isExecutableOp(op: Operation): boolean {
    const block = op.parentBlock;
    return block !== null && this.executableBlocks.has(block);
  }

  private markBlockExecutable(block: BasicBlock): void {
    if (this.executableBlocks.has(block)) return;
    this.executableBlocks.add(block);
    this.cfgWorklist.push(block);
  }

  private markEdgeExecutable(pred: BasicBlock, index: number): void {
    const terminal = pred.terminal;
    if (terminal === undefined) return;
    const successor = terminal.target(index);
    const key = this.edgeKey(pred, index);
    if (this.executableEdges.has(key)) {
      this.evaluateBlockParams(successor.block);
      return;
    }
    this.executableEdges.add(key);
    for (const arg of successor.args) {
      if (arg.kind === "produced") this.setFact(arg.value, UNKNOWN_FACT);
    }
    this.markBlockExecutable(successor.block);
    this.evaluateBlockParams(successor.block);
  }

  private edgeKey(pred: BasicBlock, index: number): string {
    return `${pred.id}:${index}`;
  }

  private evaluate(op: Operation): void {
    if (op instanceof TermOp) return this.evaluateTerm(op);
    if (op.place === undefined) return;

    if (op instanceof LiteralOp) {
      this.setFact(op.place, factForConstant(op.value));
      return;
    }
    if (op instanceof BindingDeclOp) {
      this.setFact(op.place, UNKNOWN_FACT);
      return;
    }
    if (op instanceof BindingInitOp) return this.forward(op.place, op.value);
    if (op instanceof LoadLocalOp) return this.forward(op.place, op.value);
    if (op instanceof StoreLocalOp) {
      this.forward(op.place, op.value);
      this.forward(op.lval, op.value);
      return;
    }
    if (op instanceof LoadContextOp || op instanceof StoreContextOp) {
      this.setFact(op.place, UNKNOWN_FACT);
      return;
    }
    if (op instanceof BinaryExpressionOp) return this.evaluateBinary(op);
    if (op instanceof UnaryExpressionOp) return this.evaluateUnary(op);
    if (op instanceof LogicalExpressionOp) return this.evaluateLogical(op);
    if (op instanceof UpdateExpressionOp) {
      this.setFact(op.place, primitiveFact(TypeMask.Number));
      return;
    }

    this.setFact(op.place, UNKNOWN_FACT);
  }

  private evaluateTerm(op: TermOp): void {
    const block = op.parentBlock;
    if (block === null) return;

    if (op instanceof JumpTermOp) {
      this.markEdgeExecutable(block, 0);
      return;
    }
    if (op instanceof BranchTermOp) {
      for (const i of op.takenSuccessorIndices(this)) {
        this.markEdgeExecutable(block, i);
      }
      return;
    }
    for (const i of op.successorIndices()) {
      this.markEdgeExecutable(block, i);
    }
  }

  private forward(dst: Value, src: Value): void {
    this.setFact(dst, this.getFact(src));
  }

  private getFactAt(op: Operation, value: Value): ValueFact {
    return this.localFactsBeforeOp.get(op)?.get(value.declarationId) ?? this.getFact(value);
  }

  private evaluateBinary(op: BinaryExpressionOp): void {
    const left = this.getFactAt(op, op.left);
    const right = this.getFactAt(op, op.right);
    if (left.typeMask === TypeMask.None || right.typeMask === TypeMask.None) return;

    const constant = evaluateBinaryConstant(op.operator, left, right);
    if (constant !== undefined) {
      this.setFact(op.place, factForConstant(constant));
      return;
    }

    switch (op.operator) {
      case "===":
      case "!==":
      case "==":
      case "!=":
      case "<":
      case "<=":
      case ">":
      case ">=":
      case "in":
      case "instanceof":
        this.setFact(op.place, booleanFact());
        return;
      case "+": {
        if (isDefinitelyStringAddition(left, right)) {
          this.setFact(op.place, primitiveFact(TypeMask.String));
          return;
        }
        if (mustBe(left, TypeMask.Number) && mustBe(right, TypeMask.Number)) {
          this.setFact(op.place, primitiveFact(TypeMask.Number));
          return;
        }
        if (mustBe(left, TypeMask.BigInt) && mustBe(right, TypeMask.BigInt)) {
          this.setFact(op.place, primitiveFact(TypeMask.BigInt));
          return;
        }
        this.setFact(op.place, UNKNOWN_FACT);
        return;
      }
      case "-":
      case "*":
      case "/":
      case "%":
      case "**":
        this.setFact(op.place, numericArithmeticFact(left, right));
        return;
      case "|":
      case "^":
      case "&":
      case "<<":
      case ">>":
        this.setFact(op.place, bitwiseFact(left, right));
        return;
      case ">>>":
        this.setFact(
          op.place,
          mustBe(left, TypeMask.Number) && mustBe(right, TypeMask.Number)
            ? primitiveFact(TypeMask.Number)
            : UNKNOWN_FACT,
        );
        return;
    }
  }

  private evaluateUnary(op: UnaryExpressionOp): void {
    if (op.operator === "void") {
      this.setFact(op.place, factForConstant(undefined));
      return;
    }

    const arg = this.getFactAt(op, op.argument);
    if (arg.typeMask === TypeMask.None) return;
    if ("constant" in arg && op.operator !== "delete") {
      const constant = evaluateUnaryConstant(op.operator, arg.constant);
      if (constant !== undefined) {
        this.setFact(op.place, factForConstant(constant));
        return;
      }
    }
    if (op.operator === "typeof") {
      this.setFact(op.place, primitiveFact(TypeMask.String));
      return;
    }
    if (op.operator === "!") {
      this.setFact(op.place, booleanFact());
      return;
    }

    if (op.operator === "+" || op.operator === "-" || op.operator === "~") {
      this.setFact(
        op.place,
        mustBe(arg, TypeMask.Number) ? primitiveFact(TypeMask.Number) : UNKNOWN_FACT,
      );
      return;
    }
    this.setFact(op.place, UNKNOWN_FACT);
  }

  private evaluateLogical(op: LogicalExpressionOp): void {
    const left = this.getFactAt(op, op.left);
    const right = this.getFactAt(op, op.right);
    if (left.typeMask === TypeMask.None || right.typeMask === TypeMask.None) return;

    const truthiness = this.truthiness(op.left);
    if (op.operator === "&&") {
      if (truthiness === true) return this.forward(op.place, op.right);
      if (truthiness === false) return this.forward(op.place, op.left);
    } else if (op.operator === "||") {
      if (truthiness === true) return this.forward(op.place, op.left);
      if (truthiness === false) return this.forward(op.place, op.right);
    } else {
      if (mustBeNullish(left)) return this.forward(op.place, op.right);
      if (!mayBeNullish(left)) return this.forward(op.place, op.left);
    }
    this.setFact(op.place, joinFacts(left, right));
  }
}

function joinFacts(left: ValueFact, right: ValueFact): ValueFact {
  if (left.typeMask === TypeMask.None) return right;
  if (right.typeMask === TypeMask.None) return left;

  const typeMask = left.typeMask | right.typeMask;
  if ("constant" in left && "constant" in right && Object.is(left.constant, right.constant)) {
    return { typeMask, constant: left.constant };
  }
  return { typeMask };
}

function sameFact(left: ValueFact, right: ValueFact): boolean {
  if (left.typeMask !== right.typeMask) return false;
  const leftHasConstant = "constant" in left;
  const rightHasConstant = "constant" in right;
  if (leftHasConstant !== rightHasConstant) return false;
  return !leftHasConstant || Object.is(left.constant, right.constant);
}

function joinLocalFacts(
  left: ReadonlyMap<DeclarationId, ValueFact>,
  right: ReadonlyMap<DeclarationId, ValueFact>,
): Map<DeclarationId, ValueFact> {
  const joined = new Map(left);
  for (const [declarationId, fact] of right) {
    joined.set(declarationId, joinFacts(joined.get(declarationId) ?? NO_FACT, fact));
  }
  return joined;
}

function sameLocalFacts(
  left: ReadonlyMap<DeclarationId, ValueFact>,
  right: ReadonlyMap<DeclarationId, ValueFact>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [declarationId, leftFact] of left) {
    const rightFact = right.get(declarationId);
    if (rightFact === undefined || !sameFact(leftFact, rightFact)) return false;
  }
  return true;
}

function factForConstant(value: TPrimitiveValue): ValueFact {
  return { typeMask: typeMaskForConstant(value), constant: value };
}

function primitiveFact(typeMask: TypeMask): ValueFact {
  return { typeMask };
}

function booleanFact(): ValueFact {
  return primitiveFact(TypeMask.Boolean);
}

function typeMaskForConstant(value: TPrimitiveValue): TypeMask {
  if (value === undefined) return TypeMask.Undefined;
  if (value === null) return TypeMask.Null;
  switch (typeof value) {
    case "boolean":
      return TypeMask.Boolean;
    case "string":
      return TypeMask.String;
    case "number":
      return TypeMask.Number;
    case "bigint":
      return TypeMask.BigInt;
    case "symbol":
      return TypeMask.Symbol;
  }
}

function maskForKind(kind: PrimitiveKind): TypeMask {
  switch (kind) {
    case "undefined":
      return TypeMask.Undefined;
    case "null":
      return TypeMask.Null;
    case "boolean":
      return TypeMask.Boolean;
    case "string":
      return TypeMask.String;
    case "number":
      return TypeMask.Number;
    case "bigint":
      return TypeMask.BigInt;
    case "symbol":
      return TypeMask.Symbol;
    case "object":
      return TypeMask.Object;
    case "function":
      return TypeMask.Function;
  }
}

function mustBe(fact: ValueFact, mask: TypeMask): boolean {
  return fact.typeMask !== TypeMask.None && (fact.typeMask & ~mask) === 0;
}

function mayBeFalsy(mask: TypeMask): boolean {
  return (
    (mask &
      (TypeMask.Undefined |
        TypeMask.Null |
        TypeMask.Boolean |
        TypeMask.String |
        TypeMask.Number |
        TypeMask.BigInt)) !==
    0
  );
}

function mayBeTruthy(mask: TypeMask): boolean {
  return (
    (mask &
      (TypeMask.Boolean |
        TypeMask.String |
        TypeMask.Number |
        TypeMask.BigInt |
        TypeMask.Symbol |
        TypeMask.Object |
        TypeMask.Function)) !==
    0
  );
}

function mustBeNullish(fact: ValueFact): boolean {
  return (
    fact.typeMask !== TypeMask.None && (fact.typeMask & ~(TypeMask.Null | TypeMask.Undefined)) === 0
  );
}

function mayBeNullish(fact: ValueFact): boolean {
  return (fact.typeMask & (TypeMask.Null | TypeMask.Undefined)) !== 0;
}

function isDefinitelyStringAddition(left: ValueFact, right: ValueFact): boolean {
  return mustBe(left, TypeMask.String) || mustBe(right, TypeMask.String);
}

function numericArithmeticFact(left: ValueFact, right: ValueFact): ValueFact {
  if (mustBe(left, TypeMask.Number) && mustBe(right, TypeMask.Number)) {
    return primitiveFact(TypeMask.Number);
  }
  if (mustBe(left, TypeMask.BigInt) && mustBe(right, TypeMask.BigInt)) {
    return primitiveFact(TypeMask.BigInt);
  }
  return UNKNOWN_FACT;
}

function bitwiseFact(left: ValueFact, right: ValueFact): ValueFact {
  if (mustBe(left, TypeMask.Number) && mustBe(right, TypeMask.Number)) {
    return primitiveFact(TypeMask.Number);
  }
  if (mustBe(left, TypeMask.BigInt) && mustBe(right, TypeMask.BigInt)) {
    return primitiveFact(TypeMask.BigInt);
  }
  return UNKNOWN_FACT;
}

function evaluateBinaryConstant(
  operator: BinaryExpressionOp["operator"],
  left: ValueFact,
  right: ValueFact,
): TPrimitiveValue | undefined {
  if (!("constant" in left) || !("constant" in right)) return undefined;
  try {
    const l = left.constant as never;
    const r = right.constant as never;
    switch (operator) {
      case "==":
        return l == r;
      case "!=":
        return l != r;
      case "===":
        return l === r;
      case "!==":
        return l !== r;
      case "<":
        return l < r;
      case "<=":
        return l <= r;
      case ">":
        return l > r;
      case ">=":
        return l >= r;
      case "+":
        return l + r;
      case "-":
        return l - r;
      case "*":
        return l * r;
      case "/":
        return l / r;
      case "%":
        return l % r;
      case "**":
        return l ** r;
      case "|":
        return l | r;
      case "^":
        return l ^ r;
      case "&":
        return l & r;
      case "<<":
        return l << r;
      case ">>":
        return l >> r;
      case ">>>":
        return l >>> r;
      case "in":
      case "instanceof":
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function evaluateUnaryConstant(
  operator: UnaryExpressionOp["operator"],
  value: TPrimitiveValue,
): TPrimitiveValue | undefined {
  try {
    const v = value as never;
    switch (operator) {
      case "+":
        return +v;
      case "-":
        return -v;
      case "~":
        return ~v;
      case "!":
        return !v;
      case "typeof":
        return typeof value;
      case "void":
        return undefined;
      case "delete":
        return undefined;
    }
  } catch {
    return undefined;
  }
}
