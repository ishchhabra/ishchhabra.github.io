import { IdentifierId, type BlockId } from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Operation, Trait } from "../../ir/core/Operation";
import type { Place } from "../../ir/core/Place";
import { JumpOp, Terminal } from "../../ir/ops/control";
import { forEachOutgoingEdge } from "../ssa/blockArgs";
import { FunctionAnalysis, AnalysisManager } from "./AnalysisManager";

/**
 * The result of liveness analysis: the set of identifiers that are
 * live in the function.
 *
 * Seeds from directly-read places and propagates through block
 * params + structured-op results.
 */
export class LivenessResult {
  constructor(private readonly liveIds: ReadonlySet<IdentifierId>) {}

  isLive(id: IdentifierId): boolean {
    return this.liveIds.has(id);
  }
}

export class LivenessAnalysis extends FunctionAnalysis<LivenessResult> {
  run(funcOp: FuncOp, _AM: AnalysisManager): LivenessResult {
    const liveIds = new Set<IdentifierId>();

    // Seed: every directly-read place anywhere in the function's IR,
    // walked uniformly through region tree. Block-arg edge operands
    // are deferred to the propagation phase.
    for (const block of funcOp.allBlocks()) {
      seedLiveReads(block, liveIds);
    }

    const incomingEdges = buildIncomingEdgeIndex(funcOp);

    let changed = true;
    while (changed) {
      changed = false;

      // Block-args propagation: if a block param is live, every
      // matching arg on each incoming edge is live too.
      for (const block of funcOp.allBlocks()) {
        if (block.params.length === 0) continue;
        const preds = incomingEdges.get(block.id);
        if (preds === undefined) continue;
        for (let i = 0; i < block.params.length; i++) {
          if (!liveIds.has(block.params[i].identifier.id)) continue;
          for (const args of preds) {
            const arg = args[i];
            if (arg === undefined) continue;
            if (!liveIds.has(arg.identifier.id)) {
              liveIds.add(arg.identifier.id);
              changed = true;
            }
          }
        }
      }

      // Structured-op propagation: if a structure is live (side
      // effects, live def, or live nested def) its operands are live.
      for (const block of funcOp.allBlocks()) {
        for (const op of block.operations) {
          if (!op.hasTrait(Trait.HasRegions)) continue;
          const isLive =
            op.hasSideEffects(funcOp.moduleIR.environment) ||
            op.getDefs().some((p: Place) => liveIds.has(p.identifier.id)) ||
            structureHasLiveInternalDef(op, liveIds);
          if (isLive) {
            for (const place of op.getOperands()) {
              if (!liveIds.has(place.identifier.id)) {
                liveIds.add(place.identifier.id);
                changed = true;
              }
            }
          }
        }
      }
    }

    return new LivenessResult(liveIds);
  }
}

/**
 * Walk a block and seed every directly-read place as live. For
 * structured ops, recurses into their regions.
 */
function seedLiveReads(
  block: { operations: readonly Operation[]; terminal?: Terminal },
  liveIds: Set<IdentifierId>,
): void {
  for (const op of block.operations) {
    for (const place of op.getOperands()) {
      liveIds.add(place.identifier.id);
    }
    if (op.hasTrait(Trait.HasRegions)) {
      for (const region of op.regions) {
        for (const innerBlock of region.blocks) {
          seedLiveReads(innerBlock, liveIds);
        }
      }
    }
  }
  if (block.terminal !== undefined) {
    for (const place of nonEdgeTerminalOperands(block.terminal)) {
      liveIds.add(place.identifier.id);
    }
  }
}

function structureHasLiveInternalDef(
  structure: Operation,
  liveIds: ReadonlySet<IdentifierId>,
): boolean {
  for (const region of structure.regions) {
    for (const block of region.blocks) {
      for (const param of block.params) {
        if (liveIds.has(param.identifier.id)) return true;
      }
      for (const op of block.operations) {
        for (const p of op.getDefs()) {
          if (liveIds.has(p.identifier.id)) return true;
        }
        if (op.hasTrait(Trait.HasRegions)) {
          if (structureHasLiveInternalDef(op, liveIds)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Return the operands of a terminator that are *not* block-edge
 * arguments. Only `JumpOp` has edge arguments; every other
 * terminator's operands are unconditional reads.
 */
function nonEdgeTerminalOperands(terminal: Terminal): readonly Place[] {
  if (terminal instanceof JumpOp) {
    return [];
  }
  return terminal.getOperands();
}

function buildIncomingEdgeIndex(
  funcOp: FuncOp,
): Map<BlockId, readonly (readonly Place[])[]> {
  const index = new Map<BlockId, (readonly Place[])[]>();
  for (const predBlock of funcOp.allBlocks()) {
    forEachOutgoingEdge(predBlock, (succId, args) => {
      let list = index.get(succId);
      if (list === undefined) {
        list = [];
        index.set(succId, list);
      }
      list.push(args);
    });
  }
  return index;
}
