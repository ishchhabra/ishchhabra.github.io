import { IdentifierId } from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { Operation, Trait } from "../../ir/core/Operation";
import type { Place } from "../../ir/core/Place";
import {
  collectAllSinks,
  forEachIncomingEdge,
  forEachOutgoingEdge,
  sinkParams,
} from "../ssa/blockArgs";
import { FunctionAnalysis, AnalysisManager } from "./AnalysisManager";

/**
 * The result of liveness analysis: the set of identifiers that are
 * live in the function.
 *
 * Seeds from directly-read places and propagates through edge args
 * (both flat-CFG JumpOp edges and structured-op virtual edges,
 * uniformly via {@link forEachIncomingEdge}).
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
    // walked uniformly through region tree. Edge-arg operands (JumpOp
    // args, ConditionOp trailing args, YieldOp values flowing to a
    // sink) are deferred to the edge-arg propagation phase — they're
    // only live when their sink param is live.
    for (const block of funcOp.allBlocks()) {
      seedLiveReads(funcOp, block, liveIds);
    }

    const sinks = collectAllSinks(funcOp);

    let changed = true;
    while (changed) {
      changed = false;

      // Edge-args propagation: if a sink param is live, every
      // matching arg on each incoming edge is live too. Uniform over
      // block.params (target of JumpOp / op-entry / condition-true /
      // yield-back) and op.resultPlaces (target of condition-false /
      // yield-to-results).
      for (const sink of sinks) {
        const params = sinkParams(sink);
        if (params.length === 0) continue;
        forEachIncomingEdge(funcOp, sink, (edge) => {
          for (let i = 0; i < params.length; i++) {
            if (!liveIds.has(params[i].identifier.id)) continue;
            const arg = edge.args[i];
            if (arg === undefined) continue;
            if (!liveIds.has(arg.identifier.id)) {
              liveIds.add(arg.identifier.id);
              changed = true;
            }
          }
        });
      }

      // Structured-op propagation: if a structure is live (side
      // effects, live def, or live nested def) its operands are
      // live. This covers any flat-operand ports not already reached
      // through edges.
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
 * Walk a block and seed every directly-read place as live. Edge-arg
 * operands are excluded (they'll be propagated by the edge walker).
 */
function seedLiveReads(funcOp: FuncOp, block: BasicBlock, liveIds: Set<IdentifierId>): void {
  for (const op of block.operations) {
    for (const place of op.getOperands()) {
      liveIds.add(place.identifier.id);
    }
    if (op.hasTrait(Trait.HasRegions)) {
      for (const region of op.regions) {
        for (const innerBlock of region.blocks) {
          seedLiveReads(funcOp, innerBlock, liveIds);
        }
      }
    }
  }
  if (block.terminal !== undefined) {
    for (const place of nonEdgeTerminalOperands(funcOp, block)) {
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
 * Return the operands of `block.terminal` that are *not* edge args.
 * Edge args propagate separately through the edge walker; seeding
 * them here would mark them live unconditionally, defeating DCE.
 */
function nonEdgeTerminalOperands(funcOp: FuncOp, block: BasicBlock): Place[] {
  const terminal = block.terminal;
  if (terminal === undefined) return [];
  const edgeArgPlaces = new Set<Place>();
  forEachOutgoingEdge(funcOp, block, (edge) => {
    for (const arg of edge.args) edgeArgPlaces.add(arg);
  });
  return terminal.getOperands().filter((p) => !edgeArgPlaces.has(p));
}
