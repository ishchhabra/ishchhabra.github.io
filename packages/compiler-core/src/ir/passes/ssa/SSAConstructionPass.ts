import {
  AnalysisManager,
  DominatorTree,
  DominatorTreeAnalysis,
  PreservedAnalyses,
} from "../../analysis";
import { DeclarationId, Value } from "../../core";
import { BasicBlock } from "../../core/Block";
import { FunctionIR } from "../../core/FunctionIR";
import { IRIdAllocator } from "../../core/IRIdAllocator";
import { BlockTarget, sameValueList, TerminatorOp } from "../../core/TerminatorOp";
import { InitializeBindingOp } from "../../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../../ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ops/constants/ConstantOp";
import { FunctionPass, PassResult } from "../Pass";

export interface SSAConstructionPassOptions {
  /**
   * Allocator used for block parameters inserted during SSA construction.
   */
  readonly ids: IRIdAllocator;
}

/**
 * Creates the pass that constructs binding SSA for one function.
 */
export function createSSAConstructionPass(options: SSAConstructionPassOptions): FunctionPass {
  return {
    name: "ssa-construction",

    run(fn: FunctionIR, analyses: AnalysisManager): PassResult {
      return new SSAConstructionPass(fn, analyses, options).run();
    },
  };
}

type RenameStacks = Map<DeclarationId, Value[]>;
type DefinitionBlocks = Map<DeclarationId, Set<BasicBlock>>;
type InsertedBlockParams = Map<BasicBlock, Map<DeclarationId, Value>>;

class SSAConstructionPass {
  readonly #definitionBlocks: DefinitionBlocks = new Map();
  readonly #insertedBlockParams: InsertedBlockParams = new Map();
  readonly #domChildren: Map<BasicBlock, BasicBlock[]> = new Map();
  #undefinedSeed: Value | null = null;
  #changed = false;

  constructor(
    private readonly fn: FunctionIR,
    private readonly analyses: AnalysisManager,
    private readonly options: SSAConstructionPassOptions,
  ) {}

  public run(): PassResult {
    this.collectDefinitionBlocks();

    if (this.#definitionBlocks.size === 0) {
      return { changed: false };
    }

    const dominators = this.analyses.getFunction(DominatorTreeAnalysis, this.fn);

    this.computeDominatorChildren(dominators.getImmediateDominators());
    this.placeBlockParams(dominators);
    this.renameBlock(this.fn.entryBlock, new Map());

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }

  /**
   * Finds blocks that define a new binding SSA value.
   */
  private collectDefinitionBlocks(): void {
    for (const param of this.fn.params) {
      if (param.kind === "capture") continue;
      if (param.value.declarationId !== null) {
        this.addDefinition(param.value.declarationId, this.fn.entryBlock);
      }
    }

    for (const block of this.fn.blocks) {
      for (const param of block.params) {
        if (param.declarationId !== null) {
          this.addDefinition(param.declarationId, block);
        }
      }

      for (const op of block.operations) {
        if (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) {
          this.addDefinition(op.declarationId, block);
        }
      }
    }
  }

  private addDefinition(declaration: DeclarationId, block: BasicBlock): void {
    let blocks = this.#definitionBlocks.get(declaration);
    if (blocks === undefined) {
      blocks = new Set();
      this.#definitionBlocks.set(declaration, blocks);
    }

    blocks.add(block);
  }

  /**
   * Inserts block parameters at dominance-frontier merge points.
   *
   * A block parameter is needed where different writes to the same promoted
   * declaration can reach the same block. This is the block-argument equivalent
   * of placing phi nodes, but the IR representations remains block params.
   */
  private placeBlockParams(dominators: DominatorTree): void {
    for (const [declaration, definitionBlocks] of this.#definitionBlocks) {
      const worklist = [...definitionBlocks];
      const visited = new Set(worklist);
      const placed: Set<BasicBlock> = new Set();

      while (worklist.length > 0) {
        const block = worklist.pop()!;

        for (const frontier of dominators.getDominanceFrontier(block)) {
          if (placed.has(frontier)) continue;

          placed.add(frontier);
          this.appendBlockParam(frontier, declaration);

          if (!visited.has(frontier)) {
            visited.add(frontier);
            worklist.push(frontier);
          }
        }
      }
    }
  }

  private appendBlockParam(block: BasicBlock, declaration: DeclarationId): Value {
    let params = this.#insertedBlockParams.get(block);
    if (params === undefined) {
      params = new Map();
      this.#insertedBlockParams.set(block, params);
    }

    const existing = params.get(declaration);
    if (existing !== undefined) return existing;

    const param = new Value(this.options.ids.valueId(), declaration);
    block.appendParam(param);
    params.set(declaration, param);
    this.#changed = true;
    return param;
  }

  /**
   * Renames one block using the current reaching values for each declaration.
   *
   * Blocks are visited in dominator-tree preorder. That guarantees the stack for
   * each declaration contains only values that dominate the current block.
   */
  private renameBlock(block: BasicBlock, stacks: RenameStacks): void {
    const pushed: DeclarationId[] = [];

    if (block === this.fn.entryBlock) {
      for (const param of this.fn.params) {
        if (param.kind === "capture") continue;
        if (param.value.declarationId === null) continue;
        this.push(stacks, param.value.declarationId, param.value);
        pushed.push(param.value.declarationId);
      }
    }

    for (const param of block.params) {
      if (param.declarationId === null) continue;
      this.push(stacks, param.declarationId, param);
      pushed.push(param.declarationId);
    }

    for (const op of Array.from(block.operations)) {
      if (op.ownerBlock !== block) continue;

      if (op instanceof LoadBindingOp) {
        this.resolveLoad(block, op, stacks);
        continue;
      }

      if (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) {
        this.push(stacks, op.declarationId, op.bindingValue);
        pushed.push(op.declarationId);
      }
    }

    this.rewriteSuccessorArguments(block, stacks);

    for (const child of this.#domChildren.get(block) ?? []) {
      this.renameBlock(child, stacks);
    }

    for (const declaration of pushed.reverse()) {
      this.pop(stacks, declaration);
    }
  }

  private resolveLoad(block: BasicBlock, op: LoadBindingOp, stacks: RenameStacks): void {
    if (!this.#definitionBlocks.has(op.declarationId)) return;

    const bindingValue = this.peek(stacks, op.declarationId);
    if (op.bindingValue === bindingValue) return;

    block.replaceOp(op, new LoadBindingOp(op.id, op.declarationId, op.result, bindingValue));

    this.#changed = true;
  }

  /**
   * Rewrites outgoing CFG edges after the block's operations have been renamed.
   *
   * If the successor owns block parameters inserted by this pass, this appends
   * the current reaching values to the edge so those params are bound when
   * control enters the successor.
   */
  private rewriteSuccessorArguments(block: BasicBlock, stacks: RenameStacks): void {
    let terminator: TerminatorOp | null = block.terminator;
    if (terminator === null) return;

    for (const index of terminator.successorIndices()) {
      const target = terminator.target(index);
      const nextTarget = this.rewriteTarget(target, stacks);

      if (nextTarget === target) continue;

      const replacement = terminator.withTarget(index, nextTarget);
      block.replaceOp(terminator, replacement);
      terminator = replacement;
      this.#changed = true;
    }
  }

  /**
   * Rewrites one successor targets and fills inserted block parameters.
   *
   * Existing edge operands may reference removed load results, so they are first
   * rewritten through the replacement map. Then, values for newly inserted block
   * are appended in parameter order.
   */
  private rewriteTarget(target: BlockTarget, stacks: RenameStacks): BlockTarget {
    const inserted = this.#insertedBlockParams.get(target.block);
    if (inserted === undefined) return target;

    const forwarded = [...target.operands.forwarded];

    for (const [declaration] of inserted) {
      forwarded.push(this.peek(stacks, declaration));
    }

    if (sameValueList(forwarded, target.operands.forwarded)) {
      return target;
    }

    return {
      block: target.block,
      operands: { produced: target.operands.produced, forwarded },
    };
  }

  private computeDominatorChildren(
    immediateDominators: ReadonlyMap<BasicBlock, BasicBlock | null>,
  ): void {
    for (const block of this.fn.blocks) {
      this.#domChildren.set(block, []);
    }

    for (const [block, idom] of immediateDominators) {
      if (idom === null) continue;
      this.#domChildren.get(idom)?.push(block);
    }
  }

  /**
   * Records a new reaching value for a binding.
   */
  private push(stacks: RenameStacks, declaration: DeclarationId, value: Value): void {
    let stack = stacks.get(declaration);
    if (stack === undefined) {
      stack = [];
      stacks.set(declaration, stack);
    }

    stack.push(value);
  }

  /**
   * Restores the previous reaching value after leaving a dominated region.
   */
  private pop(stacks: RenameStacks, declaration: DeclarationId): void {
    const stack = stacks.get(declaration);
    if (stack === undefined || stack.length === 0) {
      throw new Error(`SSA stack underflow for Declaration#${declaration}`);
    }

    stack.pop();
  }

  /**
   * Returns the current reaching value for a binding.
   */
  private peek(stacks: RenameStacks, declaration: DeclarationId): Value {
    const stack = stacks.get(declaration);
    const value = stack?.[stack.length - 1];

    if (value === undefined) {
      return this.undefinedSeed();
    }

    return value;
  }

  /**
   * Materializes the fallback value used for uninitialized SSA edges.
   */
  private undefinedSeed(): Value {
    if (this.#undefinedSeed !== null) return this.#undefinedSeed;

    const value = new Value(this.options.ids.valueId(), null);
    this.fn.entryBlock.insertOp(
      0,
      new ConstantOp(this.options.ids.operationId(), undefined, value),
    );

    this.#undefinedSeed = value;
    this.#changed = true;
    return value;
  }
}
