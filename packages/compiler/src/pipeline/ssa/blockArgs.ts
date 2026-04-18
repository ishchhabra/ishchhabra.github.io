import type { BasicBlock } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { Operation } from "../../ir/core/Operation";
import { Trait } from "../../ir/core/Operation";
import type { Value } from "../../ir/core/Value";
import {
  BreakOp,
  ConditionOp,
  ContinueOp,
  ForInOp,
  ForOfOp,
  ForOp,
  IfOp,
  JumpOp,
  LabeledBlockOp,
  WhileOp,
  YieldOp,
} from "../../ir/ops/control";

/**
 * Uniform control-flow edge abstraction, inspired by MLIR's
 * `RegionBranchOpInterface`.
 *
 * A single-encoding "edge" covers both the flat-CFG case (a `JumpOp`
 * forwarding args to a successor block's params) and the
 * structured-op case (op-level operands / trailing terminator
 * operands / region-entry block params / op results). Every generic
 * SSA pass — liveness, DCE's param/arg shrinking, SSAEliminator's
 * phi destruction, SSABuilder's edge-arg filling — walks edges
 * through one API and doesn't know or care which encoding backs a
 * particular edge.
 *
 * The MLIR convention this mirrors: ops that own regions expose
 * their virtual edges through an interface, and generic analyses
 * consume that interface alongside flat terminators. Here the
 * dispatch lives in {@link edgesFromOp} rather than on the op class
 * itself — there aren't enough structured ops to justify virtual
 * dispatch, and keeping the wiring in one file makes the edge
 * catalog easy to audit.
 *
 * **Sinks.** A sink is *where args land*. Two shapes:
 *   - `block`: args bind positionally to `block.params`. This is
 *     the classical flat-CFG case and also how structured ops feed
 *     their region entry blocks.
 *   - `op-results`: args bind positionally to the structured op's
 *     `resultPlaces`. The op's results are like a "virtual exit
 *     block" — they receive values from the region's terminators on
 *     normal completion.
 *
 * **The `pred` field on an edge is always a real `BasicBlock`**, even
 * for virtual edges. That block is where out-of-SSA lowering inserts
 * copy stores for this edge: right before the block's terminator.
 * For op-entry edges (WhileOp.inits), `pred` is the block that
 * *contains* the WhileOp — stores go in that block immediately
 * before the op. For condition/yield edges, `pred` is the block
 * whose terminal is the `ConditionOp` / `YieldOp`; stores go just
 * before the terminator.
 *
 * **`apply(newArgs)` mutates the backing op state** (respecting this
 * codebase's immutable-op `replaceOp` style) so analyses can shrink
 * or rewrite edge args without touching op fields directly.
 */
export type EdgeSink =
  | { readonly kind: "block"; readonly block: BasicBlock }
  | { readonly kind: "op-results"; readonly op: Operation };

export interface Edge {
  readonly pred: BasicBlock;
  readonly sink: EdgeSink;
  readonly args: readonly Value[];
  apply(newArgs: readonly Value[]): void;
  /**
   * Insert `store` into `pred` at the position where this edge's
   * copy-store semantically fires — i.e., just before the flow
   * represented by this edge leaves the predecessor block.
   *
   *   - For terminator-based edges (JumpOp, ConditionOp, YieldOp):
   *     before the terminator (equivalent to `pred.appendOp`).
   *   - For the op-entry edge (parent block → structured op's first
   *     region, carrying `inits`): before the structured op itself,
   *     not before the predecessor's terminator. Otherwise an init
   *     store lands after post-op instructions in the same block
   *     and the loop's iter-arg params read `undefined` on their
   *     first iteration.
   */
  insertCopyStore(store: Operation): void;
}

/**
 * Return the list of sink params on an {@link EdgeSink}: either the
 * block's `params` or the op's `resultPlaces`. Positional binding
 * with the edge's `args` is enforced at construction time (same
 * length).
 */
export function sinkParams(sink: EdgeSink): readonly Value[] {
  if (sink.kind === "block") return sink.block.params;
  // Structured op-results.
  if (sink.op instanceof WhileOp) return sink.op.resultPlaces;
  if (sink.op instanceof ForOp) return sink.op.resultPlaces;
  if (sink.op instanceof ForInOp) return sink.op.resultPlaces;
  if (sink.op instanceof ForOfOp) return sink.op.resultPlaces;
  if (sink.op instanceof IfOp) return sink.op.resultPlaces;
  if (sink.op instanceof LabeledBlockOp) return sink.op.resultPlaces;
  return [];
}

/**
 * Equality check for sinks — used when indexing edges by sink.
 */
export function sinkEquals(a: EdgeSink, b: EdgeSink): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "block" && b.kind === "block") return a.block === b.block;
  if (a.kind === "op-results" && b.kind === "op-results") return a.op === b.op;
  return false;
}

// ---------------------------------------------------------------------
// Edge enumeration
// ---------------------------------------------------------------------

/**
 * Visit every outgoing edge whose `pred` is `block`. Covers:
 *   - `JumpOp` terminators (one edge to the named successor).
 *   - `ConditionOp` terminator (two edges: to body-region entry, to
 *     op results).
 *   - `YieldOp` terminator (one edge: back-edge to before-region
 *     entry if inside a WhileOp body, or to op results if inside an
 *     IfOp arm).
 *   - Any structured op inlined in `block` (one op-entry edge into
 *     its first region, carrying `inits`).
 *
 * `funcOp` is used to resolve `JumpOp.target` (a BlockId) to a
 * `BasicBlock` for inclusion in the edge's `sink`.
 */
export function forEachOutgoingEdge(
  funcOp: FuncOp,
  block: BasicBlock,
  visit: (edge: Edge) => void,
): void {
  // Edges contributed by this block's terminator.
  const terminal = block.terminal;
  if (terminal instanceof JumpOp) {
    visit(makeJumpEdge(block, terminal, terminal.target));
  } else if (terminal instanceof ConditionOp) {
    const enclosing = resolveEnclosingStructuredOp(block);
    if (enclosing instanceof WhileOp) {
      const bodyEntry = enclosing.bodyRegion.blocks[0];
      if (bodyEntry !== undefined) {
        visit(makeConditionTrueEdge(block, terminal, bodyEntry));
      }
      visit(makeConditionFalseEdge(block, terminal, enclosing));
    } else if (enclosing instanceof ForOp) {
      const bodyEntry = enclosing.bodyRegion.blocks[0];
      if (bodyEntry !== undefined) {
        visit(makeConditionTrueEdge(block, terminal, bodyEntry));
      }
      visit(makeConditionFalseEdge(block, terminal, enclosing));
    }
  } else if (terminal instanceof YieldOp) {
    const enclosing = resolveEnclosingStructuredOp(block);
    if (enclosing instanceof WhileOp) {
      const beforeEntry = enclosing.beforeRegion.blocks[0];
      if (beforeEntry !== undefined && enclosing.inits.length > 0) {
        visit(makeYieldBackEdge(block, terminal, enclosing, beforeEntry));
      }
    } else if (enclosing instanceof ForOp) {
      // Route yield to the right region-entry depending on which
      // region this yield lives in. ForOp has three yield-edge
      // shapes: init → before, body → update, update → before.
      const yieldRegion = block.parent;
      if (yieldRegion === enclosing.initRegion) {
        const beforeEntry = enclosing.beforeRegion.blocks[0];
        if (beforeEntry !== undefined && enclosing.resultPlaces.length > 0) {
          visit(makeForYieldEdge(block, terminal, beforeEntry));
        }
      } else if (yieldRegion === enclosing.bodyRegion) {
        const updateEntry = enclosing.updateRegion.blocks[0];
        if (updateEntry !== undefined && enclosing.resultPlaces.length > 0) {
          visit(makeForYieldEdge(block, terminal, updateEntry));
        }
      } else if (yieldRegion === enclosing.updateRegion) {
        const beforeEntry = enclosing.beforeRegion.blocks[0];
        if (beforeEntry !== undefined && enclosing.resultPlaces.length > 0) {
          visit(makeForYieldEdge(block, terminal, beforeEntry));
        }
      }
    } else if (enclosing instanceof ForInOp || enclosing instanceof ForOfOp) {
      // Body yield both feeds the next iteration's body params and
      // the op's resultPlaces (iterator exhaustion is normal exit).
      if (enclosing.resultPlaces.length > 0) {
        const bodyEntry = enclosing.bodyRegion.blocks[0];
        if (bodyEntry !== undefined) {
          visit(makeForYieldEdge(block, terminal, bodyEntry));
        }
        visit(makeForInOrForOfYieldToResultsEdge(block, terminal, enclosing));
      }
    } else if (enclosing instanceof IfOp) {
      visit(makeYieldToResultsEdge(block, terminal, enclosing));
    } else if (enclosing instanceof LabeledBlockOp) {
      if (enclosing.resultPlaces.length > 0) {
        visit(makeLabeledBlockYieldToResultsEdge(block, terminal, enclosing));
      }
    }
  } else if (terminal instanceof BreakOp) {
    const target = resolveBreakTarget(block, terminal.label);
    if (target !== undefined) {
      visit(makeBreakEdge(block, terminal, target));
    }
  } else if (terminal instanceof ContinueOp) {
    const target = resolveContinueTarget(block, terminal.label);
    if (target !== undefined) {
      visit(makeContinueEdge(block, terminal, target));
    }
  }

  // Op-entry edges contributed by structured ops inlined in this
  // block. Snapshot before iterating — `block.operations` returns
  // the live `_ops` array when the block has no terminator, and the
  // visit callback may insert ops into `block` (op-entry copy
  // stores land immediately before the structured op).
  const snapshot = Array.from(block.operations);
  for (const op of snapshot) {
    if (op instanceof WhileOp && op.inits.length > 0) {
      const beforeEntry = op.beforeRegion.blocks[0];
      if (beforeEntry !== undefined) {
        visit(makeWhileOpEntryEdge(block, op, beforeEntry));
      }
    } else if ((op instanceof ForInOp || op instanceof ForOfOp) && op.inits.length > 0) {
      const bodyEntry = op.bodyRegion.blocks[0];
      if (bodyEntry !== undefined) {
        visit(makeForInOrForOfOpEntryEdge(block, op, bodyEntry));
      }
    }
  }
}

/**
 * Visit every incoming edge to `sink`. Walks every block in `funcOp`
 * once, delegates to {@link forEachOutgoingEdge} for enumeration.
 */
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
 * function. Used by generic SSA lowering to walk all phi merge
 * points uniformly — block params *and* structured-op result places.
 */
export function collectAllSinks(funcOp: FuncOp): EdgeSink[] {
  const sinks: EdgeSink[] = [];
  const entryBlockId = funcOp.entryBlockId;
  for (const block of funcOp.allBlocks()) {
    if (block.id !== entryBlockId && block.params.length > 0) {
      sinks.push({ kind: "block", block });
    }
    for (const op of block.operations) {
      if (
        (op instanceof WhileOp ||
          op instanceof ForOp ||
          op instanceof ForInOp ||
          op instanceof ForOfOp ||
          op instanceof IfOp ||
          op instanceof LabeledBlockOp) &&
        op.resultPlaces.length > 0
      ) {
        sinks.push({ kind: "op-results", op });
      }
    }
  }
  return sinks;
}

// ---------------------------------------------------------------------
// Edge construction helpers
// ---------------------------------------------------------------------

function makeJumpEdge(pred: BasicBlock, terminal: JumpOp, succ: BasicBlock): Edge {
  return {
    pred,
    sink: { kind: "block", block: succ },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new JumpOp(terminal.id, terminal.target, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

function makeConditionTrueEdge(
  pred: BasicBlock,
  terminal: ConditionOp,
  bodyEntry: BasicBlock,
): Edge {
  return {
    pred,
    sink: { kind: "block", block: bodyEntry },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new ConditionOp(terminal.id, terminal.value, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

function makeConditionFalseEdge(
  pred: BasicBlock,
  terminal: ConditionOp,
  op: WhileOp | ForOp,
): Edge {
  return {
    pred,
    sink: { kind: "op-results", op },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new ConditionOp(terminal.id, terminal.value, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * Back-edge from the body's `YieldOp` to the before-region entry.
 * The edge's args are the *trailing* slice of yield values (length
 * = `op.inits.length`); earlier yield values belong to other
 * mechanisms (e.g. generator yields, not used here) and are
 * preserved untouched.
 */
function makeYieldBackEdge(
  pred: BasicBlock,
  terminal: YieldOp,
  op: WhileOp,
  beforeEntry: BasicBlock,
): Edge {
  const n = op.inits.length;
  const tailStart = Math.max(terminal.values.length - n, 0);
  const args = terminal.values.slice(tailStart);
  return {
    pred,
    sink: { kind: "block", block: beforeEntry },
    args,
    apply(newArgs): void {
      const head = terminal.values.slice(0, tailStart);
      const merged = [...head, ...newArgs];
      pred.replaceOp(terminal, new YieldOp(terminal.id, merged));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

function makeLabeledBlockYieldToResultsEdge(
  pred: BasicBlock,
  terminal: YieldOp,
  op: LabeledBlockOp,
): Edge {
  const n = op.resultPlaces.length;
  const tailStart = Math.max(terminal.values.length - n, 0);
  const args = terminal.values.slice(tailStart);
  return {
    pred,
    sink: { kind: "op-results", op },
    args,
    apply(newArgs): void {
      const head = terminal.values.slice(0, tailStart);
      const merged = [...head, ...newArgs];
      pred.replaceOp(terminal, new YieldOp(terminal.id, merged));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

function makeYieldToResultsEdge(pred: BasicBlock, terminal: YieldOp, op: IfOp): Edge {
  return {
    pred,
    sink: { kind: "op-results", op },
    args: terminal.values,
    apply(newArgs): void {
      if (newArgs === terminal.values) return;
      pred.replaceOp(terminal, new YieldOp(terminal.id, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * Op-entry edge: from the block that *contains* the WhileOp into the
 * before-region's entry block, carrying the op's inits. This is how
 * the enclosing scope feeds initial values into the loop.
 *
 * The copy-store site is *immediately before the WhileOp*, not
 * before the predecessor block's terminator — the op is typically
 * followed by post-loop instructions (e.g. `console.log($result)`)
 * and the init must execute before the first iteration runs.
 */
function makeWhileOpEntryEdge(pred: BasicBlock, op: WhileOp, beforeEntry: BasicBlock): Edge {
  return {
    pred,
    sink: { kind: "block", block: beforeEntry },
    args: op.inits,
    apply(newArgs): void {
      if (newArgs === op.inits) return;
      pred.replaceOp(
        op,
        new WhileOp(op.id, op.beforeRegion, op.bodyRegion, op.label, newArgs, op.resultPlaces),
      );
    },
    insertCopyStore(store): void {
      const opIndex = pred.operations.indexOf(op);
      if (opIndex < 0) {
        throw new Error("op-entry edge: structured op not found in predecessor block");
      }
      pred.insertOpAt(opIndex, store);
    },
  };
}

function makeForInOrForOfOpEntryEdge(
  pred: BasicBlock,
  op: ForInOp | ForOfOp,
  bodyEntry: BasicBlock,
): Edge {
  return {
    pred,
    sink: { kind: "block", block: bodyEntry },
    args: op.inits,
    apply(newArgs): void {
      if (newArgs === op.inits) return;
      const rebuilt =
        op instanceof ForInOp
          ? new ForInOp(
              op.id,
              op.iterationValue,
              op.iterationTarget,
              op.object,
              op.bodyRegion,
              op.label,
              op.resultPlaces,
              newArgs,
            )
          : new ForOfOp(
              op.id,
              op.iterationValue,
              op.iterationTarget,
              op.iterable,
              op.isAwait,
              op.bodyRegion,
              op.label,
              op.resultPlaces,
              newArgs,
            );
      pred.replaceOp(op, rebuilt);
    },
    insertCopyStore(store): void {
      const opIndex = pred.operations.indexOf(op);
      if (opIndex < 0) {
        throw new Error("op-entry edge: structured op not found in predecessor block");
      }
      pred.insertOpAt(opIndex, store);
    },
  };
}

/**
 * Break edge: from the block terminating in `BreakOp` to the
 * enclosing loop (or labeled block / switch) that the break targets.
 * The sink is the target's `op-results` — break carries the loop's
 * exit values.
 *
 * Copy-store site is *before* the BreakOp terminator.
 */
function makeBreakEdge(
  pred: BasicBlock,
  terminal: BreakOp,
  op: WhileOp | ForOp | ForInOp | ForOfOp | LabeledBlockOp,
): Edge {
  return {
    pred,
    sink: { kind: "op-results", op },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new BreakOp(terminal.id, terminal.label, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * Continue edge: from the block terminating in `ContinueOp` to the
 * enclosing loop's "next iteration" entry. For `WhileOp` that's
 * `beforeRegion.blocks[0]`. For `ForOp` it's `updateRegion.blocks[0]`
 * — continue in a for-loop runs the update expression before
 * re-testing.
 */
function makeContinueEdge(
  pred: BasicBlock,
  terminal: ContinueOp,
  op: WhileOp | ForOp | ForInOp | ForOfOp,
): Edge {
  // Continue targets:
  //   - ForOp: updateRegion entry (update runs before re-test)
  //   - ForInOp/ForOfOp: bodyRegion entry (next iteration value via iterator)
  //   - WhileOp: beforeRegion entry (re-test)
  const targetEntry =
    op instanceof ForOp
      ? op.updateRegion.blocks[0]
      : op instanceof ForInOp || op instanceof ForOfOp
        ? op.bodyRegion.blocks[0]
        : op.beforeRegion.blocks[0];
  return {
    pred,
    sink: { kind: "block", block: targetEntry },
    args: terminal.args,
    apply(newArgs): void {
      if (newArgs === terminal.args) return;
      pred.replaceOp(terminal, new ContinueOp(terminal.id, terminal.label, newArgs));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * ForInOp/ForOfOp yield-to-results edge. The body's natural YieldOp
 * also signals iterator exhaustion, which is the loop's normal exit
 * path carrying values to `resultPlaces`.
 */
function makeForInOrForOfYieldToResultsEdge(
  pred: BasicBlock,
  terminal: YieldOp,
  op: ForInOp | ForOfOp,
): Edge {
  const n = op.resultPlaces.length;
  const tailStart = Math.max(terminal.values.length - n, 0);
  const args = terminal.values.slice(tailStart);
  return {
    pred,
    sink: { kind: "op-results", op },
    args,
    apply(newArgs): void {
      const head = terminal.values.slice(0, tailStart);
      const merged = [...head, ...newArgs];
      pred.replaceOp(terminal, new YieldOp(terminal.id, merged));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

/**
 * ForOp yield-to-block edge. Routes:
 *   - initRegion yield   → beforeRegion entry params (initial values)
 *   - bodyRegion yield   → updateRegion entry params (post-body)
 *   - updateRegion yield → beforeRegion entry params (back-edge)
 *
 * In all three cases the edge's args are the *trailing* slice of the
 * YieldOp's values matching the target's param count.
 */
function makeForYieldEdge(pred: BasicBlock, terminal: YieldOp, target: BasicBlock): Edge {
  const n = target.params.length;
  const tailStart = Math.max(terminal.values.length - n, 0);
  const args = terminal.values.slice(tailStart);
  return {
    pred,
    sink: { kind: "block", block: target },
    args,
    apply(newArgs): void {
      const head = terminal.values.slice(0, tailStart);
      const merged = [...head, ...newArgs];
      pred.replaceOp(terminal, new YieldOp(terminal.id, merged));
    },
    insertCopyStore(store): void {
      pred.appendOp(store);
    },
  };
}

// ---------------------------------------------------------------------
// Walk-up helpers (region → op)
// ---------------------------------------------------------------------

function resolveEnclosingStructuredOp(block: BasicBlock): Operation | undefined {
  const region = block.parent;
  if (region === null) return undefined;
  const op = region.parent;
  if (op === null) return undefined;
  if (!op.hasTrait(Trait.HasRegions)) return undefined;
  return op;
}

/**
 * Resolve a `break [label]` target by walking the region-tree
 * upward. Labeled break matches the nearest enclosing op with that
 * label; unlabeled break matches the nearest loop / switch.
 *
 * Accepts WhileOp and ForOp today; extend as SwitchOp and
 * LabeledBlockOp gain the lift.
 */
type LoopOp = WhileOp | ForOp | ForInOp | ForOfOp;
type BreakTargetOp = LoopOp | LabeledBlockOp;

function isLoopOp(op: unknown): op is LoopOp {
  return (
    op instanceof WhileOp || op instanceof ForOp || op instanceof ForInOp || op instanceof ForOfOp
  );
}

function isBreakTargetOp(op: unknown): op is BreakTargetOp {
  return isLoopOp(op) || op instanceof LabeledBlockOp;
}

function resolveBreakTarget(
  block: BasicBlock,
  label: string | undefined,
): BreakTargetOp | undefined {
  let region = block.parent;
  while (region !== null) {
    const op = region.parent;
    if (op === null) return undefined;
    if (isBreakTargetOp(op)) {
      if (label === undefined) {
        if (isLoopOp(op)) return op;
      } else if (op.label === label) {
        return op;
      }
    }
    region = op.parentBlock?.parent ?? null;
  }
  return undefined;
}

/**
 * Resolve a `continue [label]` target. Continue only targets loops,
 * not switches or labeled blocks.
 */
function resolveContinueTarget(block: BasicBlock, label: string | undefined): LoopOp | undefined {
  let region = block.parent;
  while (region !== null) {
    const op = region.parent;
    if (op === null) return undefined;
    if (isLoopOp(op)) {
      if (label === undefined || op.label === label) return op;
    }
    region = op.parentBlock?.parent ?? null;
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Back-compat helpers (narrow wrappers retained for call sites that
// still reason per-JumpOp; new code should use the uniform Edge API
// above)
// ---------------------------------------------------------------------

/**
 * @deprecated Use {@link forEachOutgoingEdge} and switch on edge.sink.
 * Retained for call sites that still reason per-JumpOp and only care
 * about flat-CFG edges; they should migrate to the uniform API.
 */
export function getEdgeArgs(
  block: BasicBlock,
  succBlock: BasicBlock,
): readonly Value[] | undefined {
  const terminal = block.terminal;
  if (terminal instanceof JumpOp && terminal.target === succBlock) {
    return terminal.args;
  }
  return undefined;
}
