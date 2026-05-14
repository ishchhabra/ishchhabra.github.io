import {
  AnalysisManager,
  DominatorTree,
  DominatorTreeAnalysis,
  PreservedAnalyses,
} from "../analysis";
import { BasicBlock } from "../core/Block";
import { FunctionIR } from "../core/FunctionIR";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { Operation } from "../core/Operation";
import { BlockTarget, TerminatorOp } from "../core/TerminatorOp";
import { DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { FunctionPass, PassResult } from "./Pass";

export interface BindingPromotionPassOptions {
  /**
   * Allocator used for block parameters inserted as phi equivalents.
   *
   * The pass does not own ids; the pipeline supplies the compilation-wide
   * allocator so generated values stay unique across the whole IR graph.
   */
  readonly ids: IRIdAllocator;

  /**
   * Declaration-backed bindings that are safe to promote.
   *
   * The caller must exclude captured bindings, imports, globals, unproven TDZ
   * cases, and bindings observed through dynamic scope.
   */
  readonly declarations: readonly DeclarationId[];
}

/**
 * Creates a pass that promotes declaration-backed bindings storage to SSA values.
 *
 * Binding promotion is the JavaScript binding equivalent of mem2reg: it removes
 * the eligible binding load/writes rewrites reads to the reaching SSA value, and
 * represents joins with block parameters rather than phi operations.
 *
 * @example
 * ```txt
 * // Before
 * entry:
 *   v0 = ConstantOp(1)
 *   InitializeBindingOp(x, v0)
 *   v1 = LoadBindingOp(x)
 *   ReturnTerminatorOp(v1)
 *
 * // After
 * entry:
 *   v0 = ConstantOp(1)
 *   ReturnTerminatorOp(v0)
 * ```
 *
 * @example
 * ```txt
 * // Before
 * entry:
 *   InitializeBindingOp(x, a)
 *   IfTerminatorOp(cond, then, join)
 * then:
 *   StoreBindingOp(x, b)
 *   JumpTerminatorOp(join)
 * join:
 *   v0 = LoadBindingOp(x)
 *   ReturnTerminatorOp(v0)
 *
 * // After
 * entry:
 *   IfTerminatorOp(cond, then, join(a))
 * then:
 *   JumpTerminatorOp(join(b))
 * join(x):
 *   ReturnTerminatorOp(x)
 * ```
 */
export function createBindingPromotionPass(options: BindingPromotionPassOptions): FunctionPass {
  return {
    name: "binding-promotion",

    run(fn: FunctionIR, analyses: AnalysisManager) {
      return new BindingPromotionPass(fn, analyses, options).run();
    },
  };
}

type RenameStacks = Map<DeclarationId, Value[]>;
type InsertedBlockParams = Map<BasicBlock, Map<DeclarationId, Value>>;
type ValueReplacements = Map<Value, Value>;

class BindingPromotionPass {
  readonly #promoted: ReadonlySet<DeclarationId>;
  readonly #insertedBlockParams: InsertedBlockParams = new Map();
  readonly #replacements: ValueReplacements = new Map();
  readonly #domChildren: Map<BasicBlock, BasicBlock[]> = new Map();
  #changed = false;

  constructor(
    private readonly fn: FunctionIR,
    private readonly analyses: AnalysisManager,
    private readonly options: BindingPromotionPassOptions,
  ) {
    this.#promoted = new Set(options.declarations);
  }

  public run(): PassResult {
    if (this.#promoted.size === 0) {
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
   * Inserts block parameters at dominance-frontier merge points.
   *
   * A block parameter is needed where different writes to the same promoted
   * declaration can reach the same block. This is the block-argument equivalent
   * of placing phi nodes, but the IR representations remains block params.
   */
  private placeBlockParams(dominators: DominatorTree): void {
    const definitionBlocks = this.collectDefinitionBlocks();

    for (const declaration of this.#promoted) {
      const worklist = [...(definitionBlocks.get(declaration) ?? [])];
      const visited = new Set(worklist);
      const placed = new Set<BasicBlock>();

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

  private collectDefinitionBlocks(): Map<DeclarationId, Set<BasicBlock>> {
    const definitions = new Map<DeclarationId, Set<BasicBlock>>();

    const add = (declaration: DeclarationId, block: BasicBlock): void => {
      if (!this.#promoted.has(declaration)) return;

      let blocks = definitions.get(declaration);
      if (blocks === undefined) {
        blocks = new Set();
        definitions.set(declaration, blocks);
      }

      blocks.add(block);
    };

    for (const param of this.fn.params) {
      if (param.kind === "capture") continue;
      if (param.value.declarationId !== null) {
        add(param.value.declarationId, this.fn.entryBlock);
      }
    }

    for (const block of this.fn.blocks) {
      for (const op of block.operations) {
        if (op instanceof InitializeBindingOp || op instanceof StoreBindingOp) {
          add(op.declarationId, block);
        }
      }
    }

    return definitions;
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

    for (const [declaration, param] of this.#insertedBlockParams.get(block) ?? []) {
      this.push(stacks, declaration, param);
      pushed.push(declaration);
    }

    for (const op of Array.from(block.operations)) {
      if (op.ownerBlock !== block) continue;

      const rewritten = this.rewriteOperands(op);

      if (rewritten instanceof LoadBindingOp && this.#promoted.has(rewritten.declarationId)) {
        this.replaceLoad(block, rewritten, stacks);
        continue;
      }

      if (rewritten instanceof InitializeBindingOp && this.#promoted.has(rewritten.declarationId)) {
        this.replaceWrite(block, rewritten, rewritten.value, stacks);
        pushed.push(rewritten.declarationId);
        continue;
      }

      if (rewritten instanceof StoreBindingOp && this.#promoted.has(rewritten.declarationId)) {
        this.replaceWrite(block, rewritten, rewritten.value, stacks);
        pushed.push(rewritten.declarationId);
        continue;
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

  private replaceLoad(block: BasicBlock, op: LoadBindingOp, stacks: RenameStacks): void {
    this.#replacements.set(op.result, this.peek(stacks, op.declarationId));
    block.removeOp(op);
    this.#changed = true;
  }

  private replaceWrite(
    block: BasicBlock,
    op: InitializeBindingOp | StoreBindingOp,
    value: Value,
    stacks: RenameStacks,
  ): void {
    this.push(stacks, op.declarationId, value);

    if (op instanceof StoreBindingOp && op.results[0] !== undefined) {
      this.#replacements.set(op.results[0], value);
    }

    block.removeOp(op);
    this.#changed = true;
  }

  private rewriteOperands(op: Operation): Operation {
    const operands = op.operands();
    const rewritten = operands.map((operand) => this.resolveReplacement(operand));

    if (sameArray(operands, rewritten)) {
      return op;
    }

    const owner = op.ownerBlock;
    if (owner === null) {
      throw new Error(`${op.constructor.name}#${op.id} is detached`);
    }

    const replacement = op.withOperands(rewritten);
    owner.replaceOp(op, replacement);
    this.#changed = true;
    return replacement;
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
    const produced = target.operands.produced.map((value) => this.resolveReplacement(value));
    const forwarded = target.operands.forwarded.map((value) => this.resolveReplacement(value));

    for (const [declaration] of this.#insertedBlockParams.get(target.block) ?? []) {
      forwarded.push(this.peek(stacks, declaration));
    }

    if (
      sameArray(produced, target.operands.produced) &&
      sameArray(forwarded, target.operands.forwarded)
    ) {
      return target;
    }

    return { block: target.block, operands: { produced, forwarded } };
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

  /** Records a new reaching value for a promoted declaration. */
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
  private pop(stacks: RenameStacks, declarations: DeclarationId): void {
    const stack = stacks.get(declarations);
    if (stack === undefined || stack.length === 0) {
      throw new Error(`SSA stack underflow for Declaration#${declarations}`);
    }

    stack.pop();
  }

  /**
   * Returns the current reaching value for a promoted declaration from the stack.
   */
  private peek(stacks: RenameStacks, declaration: DeclarationId): Value {
    const stack = stacks.get(declaration);
    const value = stack?.[stack.length - 1];

    if (value === undefined) {
      throw new Error(`No reaching SSA value for Declaration#${declaration}`);
    }

    return value;
  }

  private resolveReplacement(value: Value): Value {
    return this.#replacements.get(value) ?? value;
  }
}

function sameArray<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
