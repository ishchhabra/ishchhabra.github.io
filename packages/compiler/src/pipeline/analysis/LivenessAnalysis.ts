import { BindingInitOp, StoreLocalOp, ValueId } from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { Operation, Trait } from "../../ir/core/Operation";
import type { Value } from "../../ir/core/Value";
import { isDeclarationExported } from "../../ir/exportClaim";
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
 * (both flat-CFG JumpTermOp edges and structured-op virtual edges,
 * uniformly via {@link forEachIncomingEdge}).
 */
export class LivenessResult {
  constructor(private readonly liveIds: ReadonlySet<ValueId>) {}

  isLive(id: ValueId): boolean {
    return this.liveIds.has(id);
  }
}

export class LivenessAnalysis extends FunctionAnalysis<LivenessResult> {
  run(funcOp: FuncOp, _AM: AnalysisManager): LivenessResult {
    const liveIds = new Set<ValueId>();

    // Seed: every directly-read place anywhere in the function's IR,
    // walked uniformly through region tree. Edge-arg operands (JumpTermOp
    // args, ConditionTermOp trailing args, YieldTermOp values flowing to a
    // sink) are deferred to the edge-arg propagation phase — they're
    // only live when their sink param is live.
    for (const block of funcOp.blocks) {
      seedLiveReads(funcOp, block, liveIds);
    }

    const sinks = collectAllSinks(funcOp);

    let changed = true;
    while (changed) {
      changed = false;

      // Edge-args propagation: if a sink param is live, every
      // matching arg on each incoming edge is live too. Uniform over
      // block.params (target of JumpTermOp / op-entry / condition-true /
      // yield-back) and op.resultPlaces (target of condition-false /
      // yield-to-results).
      for (const sink of sinks) {
        const params = sinkParams(sink);
        if (params.length === 0) continue;
        forEachIncomingEdge(funcOp, sink, (edge) => {
          for (let i = 0; i < params.length; i++) {
            if (!liveIds.has(params[i].id)) continue;
            const arg = edge.args[i];
            if (arg === undefined) continue;
            if (!liveIds.has(arg.id)) {
              liveIds.add(arg.id);
              changed = true;
            }
          }
        });
      }

    }

    return new LivenessResult(liveIds);
  }
}

/**
 * Walk a block and seed every directly-read place as live. Edge-arg
 * operands are excluded (they'll be propagated by the edge walker).
 */
function seedLiveReads(funcOp: FuncOp, block: BasicBlock, liveIds: Set<ValueId>): void {
  for (const op of block.operations) {
    for (const place of op.operands()) {
      liveIds.add(place.id);
    }
    // Exports observe a binding via declarationId, not via SSA value
    // operands, so a store/init to an exported binding has no
    // operand-based reader. Mark its lval as live so DCE doesn't
    // strip the very binding the export reaches.
    if (op instanceof BindingInitOp && isDeclarationExported(funcOp, op.place.declarationId)) {
      liveIds.add(op.place.id);
    } else if (op instanceof StoreLocalOp && isDeclarationExported(funcOp, op.lval.declarationId)) {
      liveIds.add(op.lval.id);
      liveIds.add(op.place.id);
    }
  }
  if (block.terminal !== undefined) {
    for (const place of nonEdgeTerminalOperands(funcOp, block)) {
      liveIds.add(place.id);
    }
  }
}

/**
 * Return the operands of `block.terminal` that are *not* edge args.
 * Edge args propagate separately through the edge walker; seeding
 * them here would mark them live unconditionally, defeating DCE.
 */
function nonEdgeTerminalOperands(funcOp: FuncOp, block: BasicBlock): Value[] {
  const terminal = block.terminal;
  if (terminal === undefined) return [];
  const edgeArgPlaces = new Set<Value>();
  forEachOutgoingEdge(funcOp, block, (edge) => {
    for (const arg of edge.args) edgeArgPlaces.add(arg);
  });
  return terminal.operands().filter((p) => !edgeArgPlaces.has(p));
}
