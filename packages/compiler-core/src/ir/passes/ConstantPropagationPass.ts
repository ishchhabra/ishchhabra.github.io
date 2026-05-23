import {
  constantFact,
  PendingFact,
  sameValueFact,
  type SemanticFactsProvider,
  UnknownFact,
  type ValueFact,
} from "../../semantics/SemanticFacts";
import { SemanticFactsRegistry } from "../../semantics/SemanticFactsRegistry";
import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { FunctionIR, Operation, Value } from "../core";
import { BasicBlock } from "../core/Block";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { BlockTarget, TerminatorOp } from "../core/TerminatorOp";
import { canDropOperationEffects, OperationEffects, PureOperationEffects } from "../effects";
import { CallOp, CallTarget } from "../ops/calls/CallOp";
import { ConstantOp, ConstantValue } from "../ops/constants/ConstantOp";
import { BranchTerminatorOp } from "../ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../ops/control/JumpTerminatorOp";
import { LoadGlobalOp } from "../ops/globals/LoadGlobalOp";
import { TemplateLiteralOp } from "../ops/literals/TemplateLiteralOp";
import { BinaryOp, BinaryOperator } from "../ops/operators/BinaryOp";
import { UnaryOp, UnaryOperator } from "../ops/operators/UnaryOp";
import { LoadPropertyOp } from "../ops/properties/LoadPropertyOp";
import { FunctionPass, PassResult } from "./Pass";

export interface ConstantPropagationPassOptions {
  /**
   * Allocator used for constants inserted while rewriting.
   */
  readonly ids: IRIdAllocator;

  /**
   * Semantic facts supplied by language/runtime plugins.
   *
   * The SCCP lattice is local to this pass. Semantic facts are converted at the
   * boundary so plugin-level intrinsics do not leak into the solver.
   */
  readonly semantics?: SemanticFactsProvider;
}

/**
 * Creates a sparse conditional constant propagation pass.
 *
 * SCCP evaluates reachable operations over a three-point lattice:
 * `bottom`, `constant(value)`, and `top`. Executable CFG edges are tracked
 * explicitly, so block parameters merge only values from executable incoming
 * edges.
 */
export function createConstantPropagationPass(
  options: ConstantPropagationPassOptions,
): FunctionPass {
  return {
    name: "constant-propagation",

    run(fn: FunctionIR, analyses: AnalysisManager): PassResult {
      void analyses;
      return new ConstantPropagationPass(fn, options).run();
    },
  };
}

type LatticeValue =
  | { readonly kind: "bottom" }
  | { readonly kind: "constant"; readonly value: ConstantValue }
  | { readonly kind: "top" };

interface EvaluatedOperation {
  readonly value: LatticeValue;
  readonly semantic?: ValueFact;
  readonly effects?: OperationEffects;
}

interface ConstantPropagationAnalysis {
  readonly values: ReadonlyMap<Value, LatticeValue>;
  readonly semanticValues: ReadonlyMap<Value, ValueFact>;
  readonly executableBlocks: ReadonlySet<BasicBlock>;
  readonly replacementEffects: ReadonlyMap<Operation, OperationEffects>;
}

interface AnalysisState {
  readonly values: Map<Value, LatticeValue>;
  readonly semanticValues: Map<Value, ValueFact>;
  readonly executableBlocks: Set<BasicBlock>;
  readonly incomingExecutableEdges: Map<BasicBlock, Map<string, IncomingExecutableEdge>>;
  readonly blockWorklist: BasicBlock[];
  readonly queuedBlocks: Set<BasicBlock>;
  readonly replacementEffects: Map<Operation, OperationEffects>;
}

interface IncomingExecutableEdge {
  readonly target: BlockTarget;
}

interface RewriteState {
  changed: boolean;
  readonly materializedConstants: Map<BasicBlock, Map<string, Value>>;
}

const Bottom: LatticeValue = Object.freeze({ kind: "bottom" });
const Top: LatticeValue = Object.freeze({ kind: "top" });

class ConstantPropagationPass {
  readonly #ids: IRIdAllocator;
  readonly #semantics: SemanticFactsProvider;

  constructor(
    private readonly fn: FunctionIR,
    options: ConstantPropagationPassOptions,
  ) {
    this.#ids = options.ids;
    this.#semantics = options.semantics ?? SemanticFactsRegistry.empty();
  }

  public run(): PassResult {
    const analysis = this.analyze();
    const changed = this.rewrite(analysis);

    return {
      changed,
      preserved: changed ? PreservedAnalyses.none() : undefined,
    };
  }

  private analyze(): ConstantPropagationAnalysis {
    const state: AnalysisState = {
      values: new Map(),
      semanticValues: new Map(),
      executableBlocks: new Set(),
      incomingExecutableEdges: new Map(),
      blockWorklist: [],
      queuedBlocks: new Set(),
      replacementEffects: new Map(),
    };

    this.initializeBoundaryValues(state);
    this.markBlockExecutable(state, this.fn.entryBlock);

    while (state.blockWorklist.length > 0) {
      const block = state.blockWorklist.shift()!;
      state.queuedBlocks.delete(block);
      this.visitBlock(state, block);
    }

    return {
      values: state.values,
      semanticValues: state.semanticValues,
      executableBlocks: state.executableBlocks,
      replacementEffects: state.replacementEffects,
    };
  }

  private initializeBoundaryValues(state: AnalysisState): void {
    for (const param of this.fn.params) {
      if (param.kind === "capture") continue;
      this.updateValue(state, param.value, Top);
      state.semanticValues.set(param.value, UnknownFact);
    }

    for (const param of this.fn.entryBlock.params) {
      this.updateValue(state, param, Top);
      state.semanticValues.set(param, UnknownFact);
    }
  }

  private visitBlock(state: AnalysisState, block: BasicBlock): void {
    if (!state.executableBlocks.has(block)) return;

    for (const op of block.operations) {
      if (op instanceof TerminatorOp) {
        this.visitTerminator(state, block, op);
      } else {
        this.visitOperation(state, op);
      }
    }
  }

  private visitOperation(state: AnalysisState, op: Operation): void {
    if (op.results.length === 0) return;

    const evaluated = this.evaluateOperation(state, op);
    if (evaluated.effects !== undefined) {
      state.replacementEffects.set(op, evaluated.effects);
    }

    for (const result of op.results) {
      this.updateValue(state, result, evaluated.value);

      if (evaluated.semantic !== undefined) {
        state.semanticValues.set(result, evaluated.semantic);
      }
    }
  }

  private evaluateOperation(state: AnalysisState, op: Operation): EvaluatedOperation {
    if (op instanceof ConstantOp) {
      return {
        value: constantValue(op.value),
        semantic: constantFact(op.value),
        effects: PureOperationEffects,
      };
    }

    if (op instanceof LoadGlobalOp) {
      return this.evaluateSemanticFact(this.#semantics.resolveGlobal?.(op.name));
    }

    if (op instanceof LoadPropertyOp) {
      return this.evaluateLoadProperty(state, op);
    }

    if (op instanceof UnaryOp) {
      return evaluatedPureExpression(evaluateUnary(op.operator, valueOf(state, op.argument)));
    }

    if (op instanceof BinaryOp) {
      return evaluatedPureExpression(
        evaluateBinary(op.operator, valueOf(state, op.left), valueOf(state, op.right)),
      );
    }

    if (op instanceof TemplateLiteralOp) {
      return evaluatedPureExpression(
        evaluateTemplateLiteral(
          op.quasis.map((quasi) => quasi.cooked),
          op.expressions.map((value) => valueOf(state, value)),
        ),
      );
    }

    if (op instanceof CallOp) {
      return this.evaluateCall(state, op);
    }

    return { value: Top, semantic: UnknownFact };
  }

  private evaluateLoadProperty(state: AnalysisState, op: LoadPropertyOp): EvaluatedOperation {
    const object = semanticValueOf(state, op.object);
    if (object.kind === "pending") {
      return { value: Bottom, semantic: PendingFact };
    }

    const key =
      op.key.kind === "static" ? op.key.name : propertyKeyFromValue(valueOf(state, op.key.value));

    if (key === undefined) {
      return pendingIfAnyBottom([
        valueOf(state, op.object),
        op.key.kind === "computed" ? valueOf(state, op.key.value) : Top,
      ]);
    }

    return this.evaluateSemanticFact(this.#semantics.resolveStaticProperty?.(object, key));
  }

  private evaluateCall(state: AnalysisState, op: CallOp): EvaluatedOperation {
    if (op.args.some((arg) => arg.kind === "spread")) {
      return { value: Top, semantic: UnknownFact };
    }

    const target = this.callTargetSemanticValue(state, op.target);
    const args = op.args.map((arg) => semanticValueOf(state, arg.value));

    if ([target, ...args].some((fact) => fact.kind === "pending")) {
      return { value: Bottom, semantic: PendingFact };
    }

    const fact = this.#semantics.evaluateCall?.(target, args);
    return {
      ...this.evaluateSemanticFact(fact?.result),
      effects: fact?.effects,
    };
  }

  private callTargetSemanticValue(state: AnalysisState, target: CallTarget): ValueFact {
    switch (target.kind) {
      case "value":
        return semanticValueOf(state, target.callee);

      case "value-with-receiver": {
        const callee = semanticValueOf(state, target.callee);
        const receiver = semanticValueOf(state, target.receiver);
        if (callee.kind === "pending" || receiver.kind === "pending") {
          return PendingFact;
        }

        return callee;
      }

      case "property": {
        const object = semanticValueOf(state, target.object);
        if (object.kind === "pending") return PendingFact;

        const key =
          target.key.kind === "static"
            ? target.key.name
            : propertyKeyFromValue(valueOf(state, target.key.value));

        if (key === undefined) {
          return target.key.kind === "computed" &&
            valueOf(state, target.key.value).kind === "bottom"
            ? PendingFact
            : UnknownFact;
        }

        return this.#semantics.resolveStaticProperty?.(object, key) ?? UnknownFact;
      }

      case "private-property":
      case "super-property":
        return UnknownFact;
    }
  }

  private evaluateSemanticFact(fact: ValueFact | undefined): EvaluatedOperation {
    const semantic = fact ?? UnknownFact;
    return {
      value: latticeFromSemanticFact(semantic),
      semantic,
    };
  }

  private visitTerminator(state: AnalysisState, block: BasicBlock, terminator: TerminatorOp): void {
    if (terminator instanceof BranchTerminatorOp) {
      const truthiness = truthinessOf(valueOf(state, terminator.condition));

      if (truthiness === true) {
        this.propagateTarget(state, block, 0, terminator.trueTarget);
      } else if (truthiness === false) {
        this.propagateTarget(state, block, 1, terminator.falseTarget);
      } else if (truthiness === "top") {
        this.propagateTarget(state, block, 0, terminator.trueTarget);
        this.propagateTarget(state, block, 1, terminator.falseTarget);
      }

      return;
    }

    for (const index of terminator.successorIndices()) {
      this.propagateTarget(state, block, index, terminator.target(index));
    }
  }

  private propagateTarget(
    state: AnalysisState,
    predecessor: BasicBlock,
    targetIndex: number,
    target: BlockTarget,
  ): void {
    const key = edgeKey(predecessor, targetIndex);
    let incoming = state.incomingExecutableEdges.get(target.block);

    if (incoming === undefined) {
      incoming = new Map();
      state.incomingExecutableEdges.set(target.block, incoming);
    }

    if (!incoming.has(key)) incoming.set(key, { target });

    this.propagateBlockParams(state, target.block);
    this.markBlockExecutable(state, target.block);
  }

  private propagateBlockParams(state: AnalysisState, block: BasicBlock): void {
    const params = block.params;
    if (params.length === 0) return;

    const values = params.map(() => Bottom);
    const semanticValues = params.map((): ValueFact => PendingFact);

    for (const edge of state.incomingExecutableEdges.get(block)?.values() ?? []) {
      const incomingCount =
        edge.target.operands.produced.length + edge.target.operands.forwarded.length;

      if (params.length !== incomingCount) {
        throw new Error(
          `Target bb${block.id} expects ${params.length} values, got ${incomingCount}`,
        );
      }

      for (let i = 0; i < edge.target.operands.produced.length; i++) {
        values[i] = mergeLatticeValues(values[i], Top);
        semanticValues[i] = mergeSemanticFacts(semanticValues[i], UnknownFact);
      }

      for (let i = 0; i < edge.target.operands.forwarded.length; i++) {
        const paramIndex = edge.target.operands.produced.length + i;
        const value = edge.target.operands.forwarded[i];
        values[paramIndex] = mergeLatticeValues(values[paramIndex], valueOf(state, value));
        semanticValues[paramIndex] = mergeSemanticFacts(
          semanticValues[paramIndex],
          semanticValueOf(state, value),
        );
      }
    }

    for (let i = 0; i < params.length; i++) {
      this.updateValue(state, params[i], values[i]);
      state.semanticValues.set(params[i], semanticValues[i]);
    }
  }

  private markBlockExecutable(state: AnalysisState, block: BasicBlock): void {
    if (!state.executableBlocks.has(block)) {
      state.executableBlocks.add(block);
      enqueueBlock(state, block);
    }
  }

  private updateValue(state: AnalysisState, value: Value, incoming: LatticeValue): void {
    const current = valueOf(state, value);
    const next = mergeLatticeValues(current, incoming);

    if (sameLatticeValue(current, next)) return;

    state.values.set(value, next);

    for (const user of value.users) {
      if (user instanceof Operation && user.ownerBlock !== null) {
        enqueueBlock(state, user.ownerBlock);
      }
    }
  }

  private rewrite(analysis: ConstantPropagationAnalysis): boolean {
    const state: RewriteState = {
      changed: false,
      materializedConstants: new Map(),
    };

    for (const block of this.fn.blocks) {
      if (!analysis.executableBlocks.has(block)) continue;

      for (const op of Array.from(block.operations)) {
        if (op.ownerBlock !== block) continue;

        if (op instanceof TerminatorOp) {
          this.rewriteTerminator(analysis, state, block, op);
        } else {
          const rewritten = this.rewriteOperands(analysis, state, block, op);
          this.rewriteResult(analysis, state, block, rewritten);
        }
      }
    }

    return state.changed;
  }

  private rewriteTerminator(
    analysis: ConstantPropagationAnalysis,
    state: RewriteState,
    block: BasicBlock,
    terminator: TerminatorOp,
  ): void {
    const rewritten = this.rewriteOperands(analysis, state, block, terminator) as TerminatorOp;

    if (rewritten instanceof BranchTerminatorOp) {
      const truthiness = truthinessOf(valueFromAnalysis(analysis, rewritten.condition));

      if (truthiness === true || truthiness === false) {
        const target = truthiness === true ? rewritten.trueTarget : rewritten.falseTarget;

        block.replaceOp(rewritten, new JumpTerminatorOp(rewritten.id, target));
        state.changed = true;
      }
    }
  }

  private rewriteOperands(
    analysis: ConstantPropagationAnalysis,
    state: RewriteState,
    block: BasicBlock,
    op: Operation,
  ): Operation {
    const operands = op.operands();
    const rewritten = operands.map((operand) =>
      this.materializedValueFor(analysis, state, block, op, operand),
    );

    if (sameValues(operands, rewritten)) return op;

    const replacement = op.withOperands(rewritten);
    block.replaceOp(op, replacement);
    state.changed = true;
    return replacement;
  }

  private rewriteResult(
    analysis: ConstantPropagationAnalysis,
    state: RewriteState,
    block: BasicBlock,
    op: Operation,
  ): void {
    if (op.results.length !== 1) return;
    if (op instanceof ConstantOp) return;

    const value = valueFromAnalysis(analysis, op.result);
    if (value.kind !== "constant") return;

    const effects = analysis.replacementEffects.get(op) ?? op.effects();
    if (!canDropOperationEffects(effects)) return;

    block.replaceOp(op, new ConstantOp(op.id, value.value, op.result));
    state.changed = true;
  }

  private materializedValueFor(
    analysis: ConstantPropagationAnalysis,
    state: RewriteState,
    block: BasicBlock,
    before: Operation,
    value: Value,
  ): Value {
    const lattice = valueFromAnalysis(analysis, value);
    if (lattice.kind !== "constant") return value;

    const definer = value.definer;
    if (definer instanceof ConstantOp && Object.is(definer.value, lattice.value)) {
      return value;
    }

    return this.materializeConstant(state, block, before, lattice.value);
  }

  private materializeConstant(
    state: RewriteState,
    block: BasicBlock,
    before: Operation,
    value: ConstantValue,
  ): Value {
    let blockConstants = state.materializedConstants.get(block);
    if (blockConstants === undefined) {
      blockConstants = new Map();
      state.materializedConstants.set(block, blockConstants);
    }

    const key = constantKey(value);
    const existing = blockConstants.get(key);
    if (existing !== undefined) return existing;

    const result = new Value(this.#ids.valueId());
    const op = new ConstantOp(this.#ids.operationId(), value, result);

    const index = block.operations.indexOf(before);
    if (index === -1) {
      throw new Error(`${before.constructor.name}#${before.id} is not in bb${block.id}`);
    }

    block.insertOp(index, op);
    blockConstants.set(key, result);
    state.changed = true;

    return result;
  }
}

function enqueueBlock(state: AnalysisState, block: BasicBlock): void {
  if (state.queuedBlocks.has(block)) return;

  state.queuedBlocks.add(block);
  state.blockWorklist.push(block);
}

function valueOf(state: AnalysisState, value: Value): LatticeValue {
  return state.values.get(value) ?? Bottom;
}

function valueFromAnalysis(analysis: ConstantPropagationAnalysis, value: Value): LatticeValue {
  return analysis.values.get(value) ?? Bottom;
}

function semanticValueOf(state: AnalysisState, value: Value): ValueFact {
  const lattice = valueOf(state, value);
  if (lattice.kind === "constant") {
    return constantFact(lattice.value);
  }

  if (lattice.kind === "bottom") {
    return PendingFact;
  }

  return state.semanticValues.get(value) ?? UnknownFact;
}

function constantValue(value: ConstantValue): LatticeValue {
  return { kind: "constant", value };
}

function latticeFromSemanticFact(fact: ValueFact): LatticeValue {
  switch (fact.kind) {
    case "pending":
      return Bottom;

    case "constant":
      return isRepresentableConstant(fact.value) ? constantValue(fact.value) : Top;

    case "intrinsic":
    case "unknown":
      return Top;
  }
}

function mergeLatticeValues(left: LatticeValue, right: LatticeValue): LatticeValue {
  if (left.kind === "bottom") return right;
  if (right.kind === "bottom") return left;
  if (left.kind === "top" || right.kind === "top") return Top;

  return Object.is(left.value, right.value) ? left : Top;
}

function mergeSemanticFacts(left: ValueFact, right: ValueFact): ValueFact {
  if (left.kind === "pending") return right;
  if (right.kind === "pending") return left;

  return sameValueFact(left, right) ? left : UnknownFact;
}

function sameLatticeValue(left: LatticeValue, right: LatticeValue): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind !== "constant" || Object.is(left.value, (right as typeof left).value);
}

function evaluatedPureExpression(value: LatticeValue): EvaluatedOperation {
  return {
    value,
    semantic: semanticFromLatticeValue(value),
    effects: value.kind === "constant" ? PureOperationEffects : undefined,
  };
}

function semanticFromLatticeValue(value: LatticeValue): ValueFact {
  switch (value.kind) {
    case "bottom":
      return PendingFact;

    case "constant":
      return constantFact(value.value);

    case "top":
      return UnknownFact;
  }
}

function pendingIfAnyBottom(values: readonly LatticeValue[]): EvaluatedOperation {
  return values.some((value) => value.kind === "bottom")
    ? { value: Bottom, semantic: PendingFact }
    : { value: Top, semantic: UnknownFact };
}

function evaluateUnary(operator: UnaryOperator, argument: LatticeValue): LatticeValue {
  if (argument.kind === "bottom") return Bottom;
  if (argument.kind !== "constant") return Top;

  const value = argument.value;

  try {
    switch (operator) {
      case "!":
        return constantValue(!value);

      case "void":
        return constantValue(undefined);

      case "typeof":
        return constantValue(value === null ? "object" : typeof value);

      case "+":
        return typeof value === "bigint" ? Top : constantIfRepresentable(+(value as any));

      case "-":
        return typeof value === "number" || typeof value === "bigint"
          ? constantIfRepresentable(-value)
          : Top;

      case "~":
        return typeof value === "number" || typeof value === "bigint"
          ? constantIfRepresentable(~value)
          : Top;
    }
  } catch {
    return Top;
  }
}

function evaluateBinary(
  operator: BinaryOperator,
  left: LatticeValue,
  right: LatticeValue,
): LatticeValue {
  if (left.kind === "bottom" || right.kind === "bottom") return Bottom;
  if (left.kind !== "constant" || right.kind !== "constant") return Top;

  try {
    switch (operator) {
      case "+":
        if ((typeof left.value === "bigint") !== (typeof right.value === "bigint")) {
          return Top;
        }
        return constantIfRepresentable((left.value as any) + (right.value as any));

      case "-":
      case "*":
      case "/":
      case "%":
      case "**":
      case "<<":
      case ">>":
      case ">>>":
      case "&":
      case "|":
      case "^":
        if (!isNumericConstant(left.value) || !isNumericConstant(right.value)) {
          return Top;
        }
        return constantIfRepresentable(evaluateNumericBinary(operator, left.value, right.value));

      case "===":
        return constantValue(left.value === right.value);

      case "!==":
        return constantValue(left.value !== right.value);

      case "==":
        return constantValue(left.value == right.value);

      case "!=":
        return constantValue(left.value != right.value);

      case "<":
        return constantValue((left.value as number) < (right.value as number));

      case "<=":
        return constantValue((left.value as number) <= (right.value as number));

      case ">":
        return constantValue((left.value as number) > (right.value as number));

      case ">=":
        return constantValue((left.value as number) >= (right.value as number));

      case "in":
      case "instanceof":
        return Top;
    }
  } catch {
    return Top;
  }
}

function evaluateNumericBinary(
  operator: BinaryOperator,
  left: number | bigint,
  right: number | bigint,
): ConstantValue {
  switch (operator) {
    case "-":
      return (left as any) - (right as any);
    case "*":
      return (left as any) * (right as any);
    case "/":
      return (left as any) / (right as any);
    case "%":
      return (left as any) % (right as any);
    case "**":
      return (left as any) ** (right as any);
    case "<<":
      return (left as any) << (right as any);
    case ">>":
      return (left as any) >> (right as any);
    case ">>>":
      return (left as any) >>> (right as any);
    case "&":
      return (left as any) & (right as any);
    case "|":
      return (left as any) | (right as any);
    case "^":
      return (left as any) ^ (right as any);
    default:
      throw new Error(`Unsupported numeric operator ${operator}`);
  }
}

function evaluateTemplateLiteral(
  cooked: readonly (string | null)[],
  expressions: readonly LatticeValue[],
): LatticeValue {
  if (cooked.some((part) => part === null)) return Top;
  if (expressions.some((value) => value.kind === "bottom")) return Bottom;
  if (expressions.some((value) => value.kind !== "constant")) return Top;

  let result = cooked[0] ?? "";

  for (let i = 0; i < expressions.length; i++) {
    const value = expressions[i];
    if (value.kind !== "constant") return Top;

    result += String(value.value);
    result += cooked[i + 1] ?? "";
  }

  return constantValue(result);
}

function propertyKeyFromValue(value: LatticeValue): string | undefined {
  if (value.kind !== "constant") return undefined;
  return String(value.value);
}

function truthinessOf(value: LatticeValue): true | false | "bottom" | "top" {
  if (value.kind === "bottom") return "bottom";
  if (value.kind === "top") return "top";

  return Boolean(value.value);
}

function constantIfRepresentable(value: ConstantValue): LatticeValue {
  return isRepresentableConstant(value) ? constantValue(value) : Top;
}

function isRepresentableConstant(value: ConstantValue): boolean {
  return typeof value !== "number" || (Number.isFinite(value) && !Object.is(value, -0));
}

function isNumericConstant(value: ConstantValue): value is number | bigint {
  return typeof value === "number" || typeof value === "bigint";
}

function sameValues(left: readonly Value[], right: readonly Value[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function constantKey(value: ConstantValue): string {
  return `${typeof value}:${String(value)}`;
}

function edgeKey(block: BasicBlock, successorIndex: number): string {
  return `${block.id}:${successorIndex}`;
}
