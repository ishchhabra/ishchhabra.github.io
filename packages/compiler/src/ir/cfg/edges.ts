import type { BasicBlock } from "../core/Block";
import type { FuncOp } from "../core/FuncOp";
import { makeOperationId } from "../core/Operation";
import {
  producedSuccessorValues,
  successorArgValue,
  successorArgValues,
  TermOp,
  valueSuccessorArg,
  type BlockTarget,
  type SuccessorArg,
} from "../core/TermOp";
import type { Value } from "../core/Value";
import { BranchTermOp, IfTermOp, JumpTermOp } from "../ops/control";

/**
 * A live view onto one positional CFG edge — the `index`-th target
 * slot of `pred`'s terminator.
 *
 * Lazy by design: `terminator`, `sink`, and `args` re-read the
 * predecessor's current terminator on every access. After
 * {@link rewriteArgs} or {@link split} replaces that terminator, the
 * Edge stays valid as long as the target index is preserved (which
 * `withTarget` guarantees by contract). Eager fields would freeze
 * a stale array reference — silent bug surface for any pass that
 * mutates one edge before reading another.
 *
 * `pred` and `index` are stable; everything else is derived.
 */
export class Edge {
  constructor(
    public readonly pred: BasicBlock,
    public readonly index: number,
    private readonly funcOp: FuncOp,
  ) {}

  /** The predecessor's current terminator. Throws if the block lost its terminator. */
  get terminator(): TermOp {
    const t = this.pred.terminal;
    if (!(t instanceof TermOp)) {
      throw new Error(`Edge: predecessor block ${this.pred.id} has no terminator`);
    }
    return t;
  }

  /** Destination block. */
  get sink(): BasicBlock {
    return this.terminator.target(this.index).block;
  }

  /** Args bound positionally to `sink.params`. */
  get args(): readonly SuccessorArg[] {
    return this.terminator.target(this.index).args;
  }

  /**
   * Rewrite the edge's args. No-op if `newArgs` is identity-equal to
   * the current args array.
   */
  rewriteArgs(newArgs: readonly SuccessorArg[]): void {
    const term = this.terminator;
    const succ = term.target(this.index);
    if (newArgs === succ.args) return;
    this.pred.replaceOp(term, term.withTarget(this.index, { ...succ, args: newArgs }));
  }

  /** Retarget this edge, preserving target-index identity. */
  retarget(target: BlockTarget): void {
    const term = this.terminator;
    this.pred.replaceOp(term, term.withTarget(this.index, target));
  }

  /**
   * Split this edge: insert a fresh intermediate block on the edge,
   * jumping to the original sink with the original args. The
   * predecessor's terminator is rewired to target the new block (with
   * empty args). Returns the new block.
   *
   * Edge-splitting is the mechanism. Callers decide *whether* to split
   * (e.g., SSA destruction splits only critical edges).
   */
  split(): BasicBlock {
    const env = this.funcOp.moduleIR.environment;
    const term = this.terminator;
    const succ = term.target(this.index);

    const splitBlock = env.createBlock();
    splitBlock.setTerminal(
      new JumpTermOp(makeOperationId(env.nextOperationId++), {
        block: succ.block,
        args: succ.args,
      }),
    );
    this.funcOp.addBlock(splitBlock);

    this.pred.replaceOp(term, term.withTarget(this.index, { block: splitBlock, args: [] }));
    return splitBlock;
  }
}

/**
 * Yield every flat-CFG outgoing edge of `block` in target-index
 * order. Structured terminators that only name child/fallthrough
 * regions are intentionally omitted; structured conditionals expose
 * their executable arm edges because those edges can carry block args.
 * Code that needs to walk all structured-control targets should
 * iterate `terminal.targets()` directly.
 */
export function* outgoingEdges(funcOp: FuncOp, block: BasicBlock): Iterable<Edge> {
  const terminal = block.terminal;
  if (
    !(terminal instanceof JumpTermOp) &&
    !(terminal instanceof BranchTermOp) &&
    !(terminal instanceof IfTermOp)
  ) {
    return;
  }
  for (const i of terminal.successorIndices()) {
    yield new Edge(block, i, funcOp);
  }
}

/** Yield every incoming edge into `sink`. Walks every block in `funcOp`. */
export function* incomingEdges(funcOp: FuncOp, sink: BasicBlock): Iterable<Edge> {
  const blocks = Array.from(funcOp.blocks);
  for (const pred of blocks) {
    for (const edge of outgoingEdges(funcOp, pred)) {
      if (edge.sink === sink) yield edge;
    }
  }
}

/**
 * Compose an incoming edge through an empty block whose terminator is
 * `jump next(args)`.
 *
 * Block params are phi names. If the intermediate jump forwards one
 * of those params, substitute the incoming edge's corresponding arg;
 * otherwise preserve the jump's concrete value operand. Returns
 * `undefined` when the incoming edge cannot satisfy the block params.
 */
export function composeJumpThroughBlock(edge: Edge, block: BasicBlock): BlockTarget | undefined {
  if (edge.sink !== block) return undefined;
  if (edge.args.length !== block.params.length) return undefined;

  const terminal = block.terminal;
  if (!(terminal instanceof JumpTermOp)) return undefined;

  const nextArgs: SuccessorArg[] = [];
  for (const arg of terminal.args) {
    const paramIndex = block.params.indexOf(arg);
    nextArgs.push(paramIndex < 0 ? valueSuccessorArg(arg) : edge.args[paramIndex]);
  }

  return { block: terminal.targetBlock, args: nextArgs };
}

/** Thread an edge through an empty jump-only block, preserving SSA args. */
export function threadEdgeThroughEmptyJump(edge: Edge): boolean {
  const block = edge.sink;
  if (block.operations.length !== 0) return false;
  const target = composeJumpThroughBlock(edge, block);
  if (target === undefined) return false;
  if (target.block === block) return false;
  if (target.args.length !== target.block.params.length) return false;

  const current = edge.terminator.target(edge.index);
  if (
    current.block === target.block &&
    argsEqual(current.args.map(successorArgValue), target.args.map(successorArgValue))
  ) {
    return false;
  }

  edge.retarget(target);
  return true;
}

/** Values produced by control-flow semantics when entering `block`. */
export function incomingProducedValues(funcOp: FuncOp, block: BasicBlock): Value[] {
  const values: Value[] = [];
  for (const pred of funcOp.blocks) {
    const terminal = pred.terminal;
    if (!(terminal instanceof TermOp)) continue;
    for (const i of terminal.successorIndices()) {
      const successor = terminal.target(i);
      if (successor.block !== block) continue;
      values.push(...producedSuccessorValues(successor.args));
    }
  }
  return values;
}

/**
 * Every block that is a merge point — has at least one block parameter
 * and is not the function entry. Used by SSA destruction to walk all
 * phi sinks.
 */
export function mergeSinks(funcOp: FuncOp): BasicBlock[] {
  const sinks: BasicBlock[] = [];
  const entryBlock = funcOp.entryBlock;
  for (const block of funcOp.blocks) {
    if (block !== entryBlock && block.params.length > 0) {
      sinks.push(block);
    }
  }
  return sinks;
}

/**
 * Args on the unique edge from `block` to `succBlock`, or `undefined`
 * if no such edge exists. Convenience for pre-iterator call sites that
 * just need a one-shot lookup.
 */
export function getEdgeArgs(
  block: BasicBlock,
  succBlock: BasicBlock,
): readonly Value[] | undefined {
  const terminal = block.terminal;
  if (!(terminal instanceof TermOp)) return undefined;
  for (const i of terminal.successorIndices()) {
    const succ = terminal.target(i);
    if (succ.block === succBlock) return successorArgValues(succ.args);
  }
  return undefined;
}

function argsEqual(a: readonly Value[], b: readonly Value[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
