import type { BasicBlock } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { Operation } from "../../ir/core/Operation";
import type { Value } from "../../ir/core/Value";
import { JumpTermOp } from "../../ir/ops/control";

/**
 * Uniform CFG edge abstraction: a predecessor block, a sink (the
 * successor), and the positional args flowing along the edge.
 *
 * In our pure-CFG IR the only terminator that carries per-edge
 * operands is {@link JumpTermOp} — its `args` bind positionally to
 * the target block's `params`. Structured terminators (`IfTermOp`,
 * `WhileTermOp`, …) route control without forwarding values; their
 * arm blocks jump to merge points via `JumpTermOp`.
 *
 * Passes mutate edge args through `apply`, which rewrites the
 * terminator in place. They use `insertCopyStore` to place SSA
 * deconstruction copies at the correct point in the predecessor.
 */
export type EdgeSink = { readonly kind: "block"; readonly block: BasicBlock };

export interface Edge {
  readonly pred: BasicBlock;
  readonly sink: EdgeSink;
  readonly args: readonly Value[];
  apply(newArgs: readonly Value[]): void;
  /** Insert `store` into `pred` right before the jump terminator. */
  insertCopyStore(store: Operation): void;
}

/** Positional sink params for an edge — block params. */
export function sinkParams(sink: EdgeSink): readonly Value[] {
  return sink.block.params;
}

/** Identity check for sinks. */
export function sinkEquals(a: EdgeSink, b: EdgeSink): boolean {
  return a.block === b.block;
}

/**
 * Visit every outgoing edge from `block`. Only {@link JumpTermOp}
 * contributes edges — other terminators (IfTermOp, WhileTermOp, …)
 * route control without forwarding values.
 */
export function forEachOutgoingEdge(
  _funcOp: FuncOp,
  block: BasicBlock,
  visit: (edge: Edge) => void,
): void {
  const terminal = block.terminal;
  if (terminal instanceof JumpTermOp) {
    visit(makeJumpEdge(block, terminal, terminal.target));
  }
}

/** Visit every incoming edge to `sink`. Walks every block in `funcOp`. */
export function forEachIncomingEdge(
  funcOp: FuncOp,
  sink: EdgeSink,
  visit: (edge: Edge) => void,
): void {
  for (const predBlock of funcOp.allBlocks()) {
    forEachOutgoingEdge(funcOp, predBlock, (edge) => {
      if (sinkEquals(edge.sink, sink)) visit(edge);
    });
  }
}

/**
 * Collect every sink that receives at least one edge anywhere in the
 * function. Used by SSA destruction to walk all merge points.
 */
export function collectAllSinks(funcOp: FuncOp): EdgeSink[] {
  const sinks: EdgeSink[] = [];
  const entryBlockId = funcOp.entryBlockId;
  for (const block of funcOp.allBlocks()) {
    if (block.id !== entryBlockId && block.params.length > 0) {
      sinks.push({ kind: "block", block });
    }
  }
  return sinks;
}

function makeJumpEdge(pred: BasicBlock, terminal: JumpTermOp, succ: BasicBlock): Edge {
  return {
    pred,
    sink: { kind: "block", block: succ },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new JumpTermOp(terminal.id, terminal.target, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * @deprecated Prefer {@link forEachOutgoingEdge} + `edge.sink`. Retained
 * for call sites that only need the args on a specific block-to-block
 * jump.
 */
export function getEdgeArgs(
  block: BasicBlock,
  succBlock: BasicBlock,
): readonly Value[] | undefined {
  const terminal = block.terminal;
  if (terminal instanceof JumpTermOp && terminal.target === succBlock) {
    return terminal.args;
  }
  return undefined;
}
