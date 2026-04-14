import type { BasicBlock, BlockId } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { Place } from "../../ir/core/Place";
import { JumpOp, Terminal } from "../../ir/ops/control";

/**
 * Utilities for reading and mutating the per-edge argument lists
 * that terminators carry for block-arg SSA.
 *
 * Under the textbook MLIR model there is only one CFG-edge-carrying
 * terminator in a flat region: `JumpOp`. Structured control-flow
 * (IfOp, WhileOp, ForOfOp, ...) is expressed through inline
 * structured ops that own nested regions and communicate values
 * through `resultPlaces` — not through outer CFG edges.
 *
 * These helpers therefore only need to walk `JumpOp` terminators;
 * the implementation is trivial and does not special-case any op
 * type beyond Jump.
 */

/**
 * Visit every outgoing CFG edge of `block` with `(succId, args)`.
 * Only flat-CFG terminators contribute edges; structured ops are
 * processed by their own emitter / walker inside their nested
 * regions.
 */
export function forEachOutgoingEdge(
  block: BasicBlock,
  visit: (succId: BlockId, args: readonly Place[]) => void,
): void {
  const terminal = block.terminal;
  if (terminal instanceof JumpOp) {
    visit(terminal.target, terminal.args);
  }
}

/**
 * Walk every block's terminator and yield each incoming edge that
 * targets `succBlockId`.
 */
export function forEachIncomingEdge(
  funcOp: FuncOp,
  succBlockId: BlockId,
  visit: (predBlock: BasicBlock, args: readonly Place[]) => void,
): void {
  for (const predBlock of funcOp.allBlocks()) {
    forEachOutgoingEdge(predBlock, (succId, args) => {
      if (succId === succBlockId) visit(predBlock, args);
    });
  }
}

/**
 * Return the args list for the first edge `block → succBlockId`,
 * or `undefined` if no such edge exists.
 */
export function getEdgeArgs(
  block: BasicBlock,
  succBlockId: BlockId,
): readonly Place[] | undefined {
  const terminal = block.terminal;
  if (terminal instanceof JumpOp && terminal.target === succBlockId) {
    return terminal.args;
  }
  return undefined;
}

/**
 * Return a new terminator equivalent to `terminal` except that the
 * args for every edge to `succBlockId` are replaced by `mapArgs`.
 * Other edges are preserved.
 */
export function rewriteOutgoingEdgeArgs(
  terminal: Terminal,
  succBlockId: BlockId,
  mapArgs: (args: readonly Place[]) => readonly Place[],
): Terminal {
  if (terminal instanceof JumpOp && terminal.target === succBlockId) {
    const newArgs = mapArgs(terminal.args);
    if (newArgs === terminal.args) return terminal;
    return new JumpOp(terminal.id, terminal.target, newArgs);
  }
  return terminal;
}

/**
 * Drop the arg slot at `paramIndex` from every edge targeting
 * `succBlockId`.
 */
export function trimEdgeParamSlot(
  terminal: Terminal,
  succBlockId: BlockId,
  paramIndex: number,
): Terminal {
  return rewriteOutgoingEdgeArgs(terminal, succBlockId, (args) => {
    if (args.length <= paramIndex) return args;
    return args.filter((_, i) => i !== paramIndex);
  });
}

/**
 * Replace every edge targeting `succBlockId` with `newArgs`.
 */
export function setEdgeArgs(
  terminal: Terminal,
  succBlockId: BlockId,
  newArgs: readonly Place[],
): Terminal {
  return rewriteOutgoingEdgeArgs(terminal, succBlockId, () => newArgs);
}
