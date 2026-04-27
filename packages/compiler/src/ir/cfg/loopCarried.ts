import type { BasicBlock } from "../core/Block";
import type { FuncOp } from "../core/FuncOp";
import type { TermOp } from "../core/TermOp";
import type { Value } from "../core/Value";
import { ForInTermOp, ForOfTermOp, ForTermOp, WhileTermOp } from "../ops/control";
import { Edge, incomingEdges } from "./edges";

export interface DominanceQuery {
  dominates(a: BasicBlock["id"], b: BasicBlock["id"]): boolean;
}

export type StructuredLoopTermOp = ForTermOp | WhileTermOp | ForOfTermOp | ForInTermOp;

export interface StructuredLoopIterArgs {
  readonly hostBlock: BasicBlock;
  readonly term: StructuredLoopTermOp;
  readonly params: readonly Value[];
  readonly initialEdges: readonly Edge[];
  readonly yieldEdges: readonly Edge[];
}

export interface StructuredLoopCarriedEdge {
  readonly iterArgs: StructuredLoopIterArgs;
  readonly edge: Edge;
  readonly kind: "initial" | "yield";
}

export function isStructuredLoopTermOp(term: TermOp | undefined): term is StructuredLoopTermOp {
  return (
    term instanceof ForTermOp ||
    term instanceof WhileTermOp ||
    term instanceof ForOfTermOp ||
    term instanceof ForInTermOp
  );
}

/**
 * Structured-loop view over canonical CFG SSA.
 *
 * Loop iter args are represented by the host block's params. Incoming
 * non-backedge values are the initial args; incoming backedge values
 * are yield args. This keeps optimizers on one SSA model while giving
 * lowering passes an explicit loop-carried contract.
 */
export function structuredLoopIterArgs(
  funcOp: FuncOp,
  hostBlock: BasicBlock,
  dominance: DominanceQuery,
): StructuredLoopIterArgs | undefined {
  const term = hostBlock.terminal;
  if (!isStructuredLoopTermOp(term)) return undefined;
  if (hostBlock.params.length === 0) return undefined;

  const initialEdges: Edge[] = [];
  const yieldEdges: Edge[] = [];
  for (const edge of incomingEdges(funcOp, hostBlock)) {
    if (dominance.dominates(hostBlock.id, edge.pred.id)) {
      yieldEdges.push(edge);
    } else {
      initialEdges.push(edge);
    }
  }

  if (initialEdges.length === 0 || yieldEdges.length === 0) return undefined;
  return {
    hostBlock,
    term,
    params: hostBlock.params,
    initialEdges,
    yieldEdges,
  };
}

export function structuredLoopCarriedEdge(
  funcOp: FuncOp,
  edge: Edge,
  dominance: DominanceQuery,
): StructuredLoopCarriedEdge | undefined {
  const iterArgs = structuredLoopIterArgs(funcOp, edge.sink, dominance);
  if (iterArgs === undefined) return undefined;

  if (iterArgs.yieldEdges.some((yieldEdge) => sameEdge(yieldEdge, edge))) {
    return { iterArgs, edge, kind: "yield" };
  }
  if (iterArgs.initialEdges.some((initialEdge) => sameEdge(initialEdge, edge))) {
    return { iterArgs, edge, kind: "initial" };
  }
  return undefined;
}

export function structuredLoopYieldCopyPlacement(
  carried: StructuredLoopCarriedEdge,
  arg: Value,
): BasicBlock | undefined {
  if (carried.kind !== "yield") return undefined;
  const term = carried.iterArgs.term;

  if (term instanceof ForTermOp && carried.edge.pred === term.updateBlock) {
    const argBlock = arg.def?.parentBlock;
    if (argBlock !== term.bodyBlock) return undefined;

    const updatePreds = term.updateBlock.predecessors();
    if (updatePreds.size !== 1 || !updatePreds.has(term.bodyBlock)) return undefined;

    return term.bodyBlock;
  }

  return undefined;
}

function sameEdge(a: Edge, b: Edge): boolean {
  return a.pred === b.pred && a.index === b.index;
}
