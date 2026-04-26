import type { BasicBlock } from "../core/Block";
import type { FuncOp } from "../core/FuncOp";
import { makeOperationId } from "../core/Operation";
import {
  producedSuccessorValues,
  successorArgValues,
  TermOp,
  type SuccessorArg,
} from "../core/TermOp";
import type { Value } from "../core/Value";
import { BranchTermOp, JumpTermOp } from "../ops/control";

/**
 * A live view onto one positional CFG edge — the `index`-th successor
 * slot of `pred`'s terminator.
 *
 * Lazy by design: `terminator`, `sink`, and `args` re-read the
 * predecessor's current terminator on every access. After
 * {@link rewriteArgs} or {@link split} replaces that terminator, the
 * Edge stays valid as long as the successor index is preserved (which
 * `withSuccessor` guarantees by contract). Eager fields would freeze
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
    return this.terminator.successor(this.index).block;
  }

  /** Args bound positionally to `sink.params`. */
  get args(): readonly SuccessorArg[] {
    return this.terminator.successor(this.index).args;
  }

  /**
   * Rewrite the edge's args. No-op if `newArgs` is identity-equal to
   * the current args array.
   */
  rewriteArgs(newArgs: readonly SuccessorArg[]): void {
    const term = this.terminator;
    const succ = term.successor(this.index);
    if (newArgs === succ.args) return;
    this.pred.replaceOp(term, term.withSuccessor(this.index, { ...succ, args: newArgs }));
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
    const succ = term.successor(this.index);

    const splitBlock = env.createBlock();
    splitBlock.setTerminal(
      new JumpTermOp(
        makeOperationId(env.nextOperationId++),
        succ.block,
        successorArgValues(succ.args),
      ),
    );
    this.funcOp.addBlock(splitBlock);

    this.pred.replaceOp(term, term.withSuccessor(this.index, { block: splitBlock, args: [] }));
    return splitBlock;
  }
}

/**
 * Yield every flat-CFG outgoing edge of `block` in successor-index
 * order. Only `JumpTermOp` and `BranchTermOp` carry positional args
 * along their successor edges; structured terminators (ForOf, ForIn,
 * For, While, If, Try, Switch, Labeled) route control without
 * forwarding args, so their successor slots aren't surfaced as edges
 * here. Code that needs to walk structured-control successors should
 * iterate `terminal.successors()` directly.
 */
export function* outgoingEdges(funcOp: FuncOp, block: BasicBlock): Iterable<Edge> {
  const terminal = block.terminal;
  if (!(terminal instanceof JumpTermOp) && !(terminal instanceof BranchTermOp)) return;
  const count = terminal.successorCount();
  for (let i = 0; i < count; i++) {
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

/** Values produced by control-flow semantics when entering `block`. */
export function incomingProducedValues(funcOp: FuncOp, block: BasicBlock): Value[] {
  const values: Value[] = [];
  for (const pred of funcOp.blocks) {
    const terminal = pred.terminal;
    if (!(terminal instanceof TermOp)) continue;
    for (let i = 0; i < terminal.successorCount(); i++) {
      const successor = terminal.successor(i);
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
  for (let i = 0; i < terminal.successorCount(); i++) {
    const succ = terminal.successor(i);
    if (succ.block === succBlock) return successorArgValues(succ.args);
  }
  return undefined;
}
