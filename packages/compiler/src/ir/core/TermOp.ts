import type { BasicBlock } from "./Block";
import { Operation } from "./Operation";
import type { Value } from "./Value";

export type SuccessorArg =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "produced"; readonly value: Value };

export interface CFGSuccessor {
  readonly block: BasicBlock;
  readonly args: readonly SuccessorArg[];
}

export function valueSuccessorArg(value: Value): SuccessorArg {
  return { kind: "value", value };
}

export function producedSuccessorArg(value: Value): SuccessorArg {
  return { kind: "produced", value };
}

export function valueSuccessorArgs(values: readonly Value[]): SuccessorArg[] {
  return values.map(valueSuccessorArg);
}

export function successorArgValue(arg: SuccessorArg): Value {
  return arg.value;
}

export function successorArgValues(args: readonly SuccessorArg[]): Value[] {
  return args.map(successorArgValue);
}

export function producedSuccessorValues(args: readonly SuccessorArg[]): Value[] {
  return args.flatMap((arg) => (arg.kind === "produced" ? [arg.value] : []));
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

  override attach(block: BasicBlock | null): void {
    super.attach(block);
    for (const successor of this.successors()) {
      successor.block._addUse(this);
    }
  }

  override detach(): void {
    for (const successor of this.successors()) {
      successor.block._removeUse(this);
    }
    super.detach();
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
