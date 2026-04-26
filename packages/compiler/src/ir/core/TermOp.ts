import type { BasicBlock } from "./Block";
import { Operation } from "./Operation";
import type { Value } from "./Value";

export type SuccessorArg =
  | { readonly kind: "value"; readonly value: Value }
  | { readonly kind: "produced"; readonly value: Value };

export interface BlockTarget {
  readonly block: BasicBlock;
  readonly args: readonly SuccessorArg[];
}

export type Truthiness = boolean | "unknown" | "pending";
export type Equality = boolean | "unknown" | "pending";

export interface ControlFlowFacts {
  truthiness(value: Value): Truthiness;
  strictEqual(left: Value, right: Value): Equality;
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
  abstract targetCount(): number;
  abstract target(index: number): BlockTarget;
  abstract withTarget(index: number, target: BlockTarget): TermOp;

  targets(): BlockTarget[] {
    const targets: BlockTarget[] = [];
    for (let i = 0; i < this.targetCount(); i++) {
      targets.push(this.target(i));
    }
    return targets;
  }

  successorIndices(): readonly number[] {
    return Array.from({ length: this.targetCount() }, (_, i) => i);
  }

  takenSuccessorIndices(_facts: ControlFlowFacts): readonly number[] {
    return this.successorIndices();
  }

  override attach(block: BasicBlock | null): void {
    super.attach(block);
    for (const target of this.targets()) {
      target.block._addUse(this);
    }
  }

  override detach(): void {
    for (const target of this.targets()) {
      target.block._removeUse(this);
    }
    super.detach();
  }

  override remap(from: BasicBlock, to: BasicBlock): void {
    let replacement: TermOp | undefined;
    for (let i = 0; i < (replacement ?? this).targetCount(); i++) {
      const current = replacement ?? this;
      const target = current.target(i);
      if (target.block !== from) continue;
      replacement = current.withTarget(i, { ...target, block: to });
    }
    if (replacement === undefined) return;
    if (this.parentBlock === null) {
      throw new Error(`${this.constructor.name}.remap: cannot remap a detached terminator`);
    }
    this.parentBlock.replaceOp(this, replacement);
  }
}

export function assertNoTargetArgs(opName: string, successor: BlockTarget): void {
  if (successor.args.length !== 0) {
    throw new Error(`${opName} successor edges do not accept block arguments`);
  }
}

export function invalidTargetIndex(opName: string, index: number): never {
  throw new Error(`${opName} successor index ${index} is out of range`);
}
