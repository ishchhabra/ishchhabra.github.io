import { BasicBlock } from "../../core/Block";
import {
  cloneBindingPatternTarget,
  type BindingPatternTarget,
} from "../../core/DestructurePattern";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  blockTarget,
  cloneBlockTarget,
  replaceForwardedOperands,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

export type ForHeaderInit =
  | { readonly kind: "none" }
  | { readonly kind: "expression"; readonly value: Value }
  | {
      readonly kind: "declaration";
      readonly declarationKind: "var" | "let" | "const";
      readonly declarators: readonly ForHeaderDeclarator[];
    };

export interface ForHeaderDeclarator {
  readonly target: BindingPatternTarget;
  readonly initializer: Value | null;
  readonly bindingValue: Value | null;
}

/**
 * Structured terminator for `for` statements.
 *
 * The initializer executes before this terminator. The host block then enters
 * the test block. The test branches to the body or exit. A normally completing
 * body jumps to the update block, and the update block jumps back to the host.
 */
export class ForTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly initTarget: BlockTarget | null,
    public readonly headerInit: ForHeaderInit,
    public readonly testTarget: BlockTarget,
    public readonly bodyBlock: BasicBlock,
    public readonly updateBlock: BasicBlock,
    public readonly completionBlock: BasicBlock,
    public readonly label: string | null = null,
  ) {
    super(id);
  }

  public get testBlock(): BasicBlock {
    return this.testTarget.block;
  }

  public override operands(): readonly Value[] {
    return this.testTarget.operands.forwarded;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ForTerminatorOp {
    const expected = this.testTarget.operands.forwarded.length;

    if (operands.length !== expected) {
      throw new Error(
        `ForTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const testTarget = replaceForwardedOperands(this.testTarget, operands);
    if (testTarget === this.testTarget) return this;

    return new ForTerminatorOp(
      this.id,
      this.initTarget,
      this.headerInit,
      testTarget,
      this.bodyBlock,
      this.updateBlock,
      this.completionBlock,
      this.label,
    );
  }

  public override clone(context: OperationCloneContext): ForTerminatorOp {
    return new ForTerminatorOp(
      context.ids.operationId(),
      this.initTarget === null ? null : cloneBlockTarget(context, this.initTarget),
      cloneForHeaderInit(context, this.headerInit),
      cloneBlockTarget(context, this.testTarget),
      context.block(this.bodyBlock),
      context.block(this.updateBlock),
      context.block(this.completionBlock),
      this.label,
    );
  }

  public override targetCount(): number {
    return this.initTarget === null ? 4 : 5;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.testTarget;
    if (index === 1) return blockTarget(this.bodyBlock);
    if (index === 2) return blockTarget(this.updateBlock);
    if (index === 3) return blockTarget(this.completionBlock);
    if (index === 4 && this.initTarget !== null) return this.initTarget;

    throw new Error(`ForTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): ForTerminatorOp {
    if (index === 0) {
      return new ForTerminatorOp(
        this.id,
        this.initTarget,
        this.headerInit,
        target,
        this.bodyBlock,
        this.updateBlock,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 1) {
      return new ForTerminatorOp(
        this.id,
        this.initTarget,
        this.headerInit,
        this.testTarget,
        target.block,
        this.updateBlock,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 2) {
      return new ForTerminatorOp(
        this.id,
        this.initTarget,
        this.headerInit,
        this.testTarget,
        this.bodyBlock,
        target.block,
        this.completionBlock,
        this.label,
      );
    }

    if (index === 3) {
      return new ForTerminatorOp(
        this.id,
        this.initTarget,
        this.headerInit,
        this.testTarget,
        this.bodyBlock,
        this.updateBlock,
        target.block,
        this.label,
      );
    }

    if (index === 4 && this.initTarget !== null) {
      return new ForTerminatorOp(
        this.id,
        target,
        this.headerInit,
        this.testTarget,
        this.bodyBlock,
        this.updateBlock,
        this.completionBlock,
        this.label,
      );
    }

    throw new Error(`ForTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return [0];
  }
}

function cloneForHeaderInit(context: OperationCloneContext, init: ForHeaderInit): ForHeaderInit {
  switch (init.kind) {
    case "none":
      return init;

    case "expression":
      return { kind: "expression", value: context.value(init.value) };

    case "declaration":
      return {
        kind: "declaration",
        declarationKind: init.declarationKind,
        declarators: init.declarators.map((declarator) => ({
          target: cloneBindingPatternTarget(context, declarator.target),
          initializer:
            declarator.initializer === null ? null : context.value(declarator.initializer),
          bindingValue:
            declarator.bindingValue === null ? null : context.value(declarator.bindingValue),
        })),
      };
  }
}
