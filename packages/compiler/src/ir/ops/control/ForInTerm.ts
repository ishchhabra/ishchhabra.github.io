import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  type CFGSuccessor,
  invalidSuccessorIndex,
  producedSuccessorArg,
  TermOp,
} from "../../core/TermOp";

import type { LoopHeadBindingKind } from "./ForOfTerm";

/**
 * `for (key in object) body`.
 *
 * Same shape as {@link import("./ForOfTerm").ForOfTermOp} but iterates
 * enumerable keys of `object` instead of a `@@iterator` protocol.
 */
export class ForInTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly iterationValue: Value,
    public readonly iterationBindingKind: LoopHeadBindingKind,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.object];
  }

  override results(): Value[] {
    return [this.iterationValue];
  }

  successorCount(): number {
    return 2;
  }

  successor(index: number): CFGSuccessor {
    if (index === 0) {
      return { block: this.bodyBlock, args: [producedSuccessorArg(this.iterationValue)] };
    }
    if (index === 1) return { block: this.exitBlock, args: [] };
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  withSuccessor(index: number, successor: CFGSuccessor): ForInTermOp {
    if (index === 0) {
      return new ForInTermOp(
        this.id,
        this.object,
        this.iterationValue,
        this.iterationBindingKind,
        successor.block,
        this.exitBlock,
        this.label,
      );
    }
    if (index === 1) {
      return new ForInTermOp(
        this.id,
        this.object,
        this.iterationValue,
        this.iterationBindingKind,
        this.bodyBlock,
        successor.block,
        this.label,
      );
    }
    return invalidSuccessorIndex(this.constructor.name, index);
  }

  rewrite(values: Map<Value, Value>): ForInTermOp {
    const newObj = values.get(this.object) ?? this.object;
    if (newObj === this.object) return this;
    return new ForInTermOp(
      this.id,
      newObj,
      this.iterationValue,
      this.iterationBindingKind,
      this.bodyBlock,
      this.exitBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): ForInTermOp {
    return new ForInTermOp(
      nextId(ctx),
      remapPlace(ctx, this.object),
      remapPlace(ctx, this.iterationValue),
      this.iterationBindingKind,
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}
