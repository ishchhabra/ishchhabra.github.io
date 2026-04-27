import {
  BindingInitOp,
  makeOperationId,
  StoreLocalOp,
} from "../../ir";
import {
  Edge,
  structuredLoopCarriedEdge,
  structuredLoopYieldCopyPlacement,
} from "../../ir/cfg";
import type { BasicBlock } from "../../ir/core/Block";
import type { FuncOp } from "../../ir/core/FuncOp";
import type { ModuleIR } from "../../ir/core/ModuleIR";
import type { Value } from "../../ir/core/Value";
import type { DominatorTree } from "../analysis/DominatorTreeAnalysis";

export type CopyPlacement =
  | { readonly kind: "edge"; readonly block: BasicBlock; readonly key: string }
  | { readonly kind: "body-epilogue"; readonly block: BasicBlock; readonly key: string };

type EdgeCopy = {
  readonly edge: Edge;
  readonly param: Value;
  readonly arg: Value;
};

type PendingCopy = {
  readonly param: Value;
  arg: Value;
};

export class EdgeCopyScheduler {
  readonly #copies: EdgeCopy[] = [];
  readonly #defaultPlacement = new Map<string, BasicBlock>();

  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
    private readonly domTree: DominatorTree,
  ) {}

  add(edge: Edge, param: Value, arg: Value): void {
    if (arg.id === param.id) return;
    this.#copies.push({ edge, param, arg });
  }

  emit(): void {
    const groups = new Map<string, { block: BasicBlock; copies: EdgeCopy[] }>();
    for (const copy of this.#copies) {
      const placement = this.#placementFor(copy);
      const group = groups.get(placement.key);
      if (group === undefined) {
        groups.set(placement.key, { block: placement.block, copies: [copy] });
      } else {
        group.copies.push(copy);
      }
    }

    for (const { block, copies } of groups.values()) {
      this.#emitParallelCopies(block, copies);
    }
  }

  #placementFor(copy: EdgeCopy): CopyPlacement {
    const carried = structuredLoopCarriedEdge(this.funcOp, copy.edge, this.domTree);
    if (carried !== undefined) {
      const structuredPlacement = structuredLoopYieldCopyPlacement(carried, copy.arg);
      if (structuredPlacement !== undefined) {
        return {
          kind: "body-epilogue",
          block: structuredPlacement,
          key: `body-epilogue:${this.#edgeKey(copy.edge)}:${structuredPlacement.id}`,
        };
      }
    }

    const key = this.#edgeKey(copy.edge);
    const cached = this.#defaultPlacement.get(key);
    if (cached !== undefined) return { kind: "edge", block: cached, key: `edge:${key}` };

    const block =
      copy.edge.terminator.successorIndices().length === 1 ? copy.edge.pred : copy.edge.split();
    this.#defaultPlacement.set(key, block);
    return { kind: "edge", block, key: `edge:${key}` };
  }

  #emitParallelCopies(block: BasicBlock, copies: readonly EdgeCopy[]): void {
    const env = this.moduleIR.environment;
    const pending: PendingCopy[] = copies.map((copy) => ({
      param: copy.param,
      arg: copy.arg,
    }));

    while (pending.length > 0) {
      const sourceDecls = new Set(pending.map((copy) => copy.arg.declarationId));
      const readyIndex = pending.findIndex((copy) => !sourceDecls.has(copy.param.declarationId));

      if (readyIndex >= 0) {
        const [copy] = pending.splice(readyIndex, 1);
        this.#emitStore(block, copy.param, copy.arg);
        continue;
      }

      const cycle = pending[0];
      const temp = env.createValue();
      const overwritten = cycle.param;
      block.appendOp(
        new BindingInitOp(makeOperationId(env.nextOperationId++), temp, "const", overwritten),
      );
      for (const copy of pending) {
        if (copy.arg.declarationId === overwritten.declarationId) {
          copy.arg = temp;
        }
      }
    }
  }

  #emitStore(block: BasicBlock, param: Value, arg: Value): void {
    const env = this.moduleIR.environment;
    const storeId = makeOperationId(env.nextOperationId++);
    const storePlace = env.createValue(param.declarationId);
    block.appendOp(new StoreLocalOp(storeId, storePlace, param, arg));
  }

  #edgeKey(edge: Edge): string {
    return `${edge.pred.id}:${edge.index}`;
  }
}
