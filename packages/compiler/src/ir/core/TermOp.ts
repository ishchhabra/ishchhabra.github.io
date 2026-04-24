import type { BasicBlock } from "./Block";
import { Operation } from "./Operation";
import type { Value } from "./Value";

export interface CFGSuccessor {
  readonly block: BasicBlock;
  readonly args: readonly Value[];
}

export abstract class TermOp extends Operation {
  abstract successorCount(): number;
  abstract successor(index: number): CFGSuccessor;
  abstract withSuccessor(index: number, successor: CFGSuccessor): TermOp;

  successors(): CFGSuccessor[] {
    const successors: CFGSuccessor[] = [];
    for (let i = 0; i < this.successorCount(); i++) {
      successors.push(this.successor(i));
    }
    return successors;
  }

  override remap(from: BasicBlock, to: BasicBlock): void {
    let replacement: TermOp | undefined;
    for (let i = 0; i < (replacement ?? this).successorCount(); i++) {
      const current = replacement ?? this;
      const successor = current.successor(i);
      if (successor.block !== from) continue;
      replacement = current.withSuccessor(i, { ...successor, block: to });
    }
    if (replacement === undefined) return;
    if (this.parentBlock === null) {
      throw new Error(`${this.constructor.name}.remap: cannot remap a detached terminator`);
    }
    this.parentBlock.replaceOp(this, replacement);
  }
}

export function assertNoSuccessorArgs(opName: string, successor: CFGSuccessor): void {
  if (successor.args.length !== 0) {
    throw new Error(`${opName} successor edges do not accept block arguments`);
  }
}

export function invalidSuccessorIndex(opName: string, index: number): never {
  throw new Error(`${opName} successor index ${index} is out of range`);
}
