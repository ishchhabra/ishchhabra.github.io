import { IfTermOp, JumpTermOp, successorArgValue, type Value } from "../../ir";
import { incomingEdges } from "../../ir/cfg";
import type { BasicBlock } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import { FunctionAnalysis, type AnalysisManager } from "./AnalysisManager";

export interface BlockParamIncomingValue {
  readonly pred: BasicBlock;
  readonly edgeIndex: number;
  readonly arg: Value;
}

export interface BlockParamFlow {
  readonly joinBlock: BasicBlock;
  readonly param: Value;
  readonly incoming: readonly BlockParamIncomingValue[];
}

export interface ValueDiamond {
  readonly header: BasicBlock;
  readonly thenBlock: BasicBlock;
  readonly elseBlock: BasicBlock;
  readonly joinBlock: BasicBlock;
  readonly resultParam: Value;
  readonly test: Value;
  readonly thenValue: Value;
  readonly elseValue: Value;
}

export class BlockParamFlowSnapshot {
  constructor(readonly flows: readonly BlockParamFlow[]) {}

  valueDiamonds(): ValueDiamond[] {
    const diamonds: ValueDiamond[] = [];
    for (const flow of this.flows) {
      const diamond = matchValueDiamond(flow);
      if (diamond !== undefined) diamonds.push(diamond);
    }
    return diamonds;
  }
}

const snapshotsByFunction = new WeakMap<FuncOp, BlockParamFlowSnapshot>();

export function setBlockParamFlowSnapshot(funcOp: FuncOp, snapshot: BlockParamFlowSnapshot): void {
  snapshotsByFunction.set(funcOp, snapshot);
}

export function getBlockParamFlowSnapshot(funcOp: FuncOp): BlockParamFlowSnapshot | undefined {
  return snapshotsByFunction.get(funcOp);
}

export class BlockParamFlowAnalysis extends FunctionAnalysis<BlockParamFlowSnapshot> {
  run(funcOp: FuncOp, _AM: AnalysisManager): BlockParamFlowSnapshot {
    const flows: BlockParamFlow[] = [];
    for (const joinBlock of funcOp.blocks) {
      if (joinBlock.params.length === 0) continue;
      const edges = [...incomingEdges(funcOp, joinBlock)];
      for (let index = 0; index < joinBlock.params.length; index++) {
        const incoming: BlockParamIncomingValue[] = [];
        for (const edge of edges) {
          const edgeArg = edge.args[index];
          if (edgeArg === undefined) continue;
          incoming.push({
            pred: edge.pred,
            edgeIndex: edge.index,
            arg: successorArgValue(edgeArg),
          });
        }
        flows.push({ joinBlock, param: joinBlock.params[index], incoming });
      }
    }
    return new BlockParamFlowSnapshot(flows);
  }
}

export class CaptureBlockParamFlowSnapshotPass {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly AM: AnalysisManager,
  ) {}

  run(): { changed: boolean } {
    setBlockParamFlowSnapshot(this.funcOp, this.AM.get(BlockParamFlowAnalysis, this.funcOp));
    return { changed: false };
  }
}

function matchValueDiamond(flow: BlockParamFlow): ValueDiamond | undefined {
  if (flow.incoming.length !== 2) return undefined;
  const [first, second] = flow.incoming;
  if (!(first.pred.terminal instanceof JumpTermOp)) return undefined;
  if (!(second.pred.terminal instanceof JumpTermOp)) return undefined;

  const header = commonIfHeader(first.pred, second.pred, flow.joinBlock);
  if (header === undefined) return undefined;
  const term = header.terminal;
  if (!(term instanceof IfTermOp)) return undefined;

  const thenIncoming = flow.incoming.find((incoming) => incoming.pred === term.thenBlock);
  const elseIncoming = flow.incoming.find((incoming) => incoming.pred === term.elseBlock);
  if (thenIncoming === undefined || elseIncoming === undefined) return undefined;

  return {
    header,
    thenBlock: term.thenBlock,
    elseBlock: term.elseBlock,
    joinBlock: flow.joinBlock,
    resultParam: flow.param,
    test: term.cond,
    thenValue: thenIncoming.arg,
    elseValue: elseIncoming.arg,
  };
}

function commonIfHeader(
  firstPred: BasicBlock,
  secondPred: BasicBlock,
  joinBlock: BasicBlock,
): BasicBlock | undefined {
  const candidates = new Set<BasicBlock>();
  for (const use of firstPred.uses) {
    if (use instanceof IfTermOp && use.fallthroughBlock === joinBlock) {
      candidates.add(use.parentBlock!);
    }
  }
  for (const use of secondPred.uses) {
    if (
      use instanceof IfTermOp &&
      use.fallthroughBlock === joinBlock &&
      use.parentBlock !== null &&
      candidates.has(use.parentBlock)
    ) {
      return use.parentBlock;
    }
  }
  return undefined;
}
