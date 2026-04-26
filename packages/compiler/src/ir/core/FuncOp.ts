import type { Environment } from "../../environment";
import { ArrowFunctionExpressionOp } from "../ops/func/ArrowFunctionExpression";
import { FunctionDeclarationOp } from "../ops/func/FunctionDeclaration";
import { FunctionExpressionOp } from "../ops/func/FunctionExpression";
import { BasicBlock, BlockId } from "./Block";
import {
  collectDestructureTargetBindingPlaces,
  type DestructureTarget,
  rewriteDestructureTarget,
} from "./Destructure";
import type { LexicalScopeKind } from "./LexicalScope";
import { ModuleIR } from "./ModuleIR";
import {
  type CloneContext,
  makeCloneContext,
  makeOperationId,
  Operation,
  type OperationId,
} from "./Operation";
import { TermOp } from "./TermOp";
import { Value } from "./Value";

// ---------------------------------------------------------------------
// Block clone helpers (used by FuncOp.clone only)
// ---------------------------------------------------------------------

/**
 * Phase-1 block clone: allocate a fresh block and deep-clone every
 * non-terminator op into it.
 */
function phase1CloneBlock(oldBlock: BasicBlock, moduleIR: ModuleIR): BasicBlock {
  const environment = moduleIR.environment;
  const newBlock = environment.createBlock();
  const ctx: CloneContext = {
    environment,
    moduleIR,
    blockMap: new Map(),
    valueMap: new Map(),
  };
  for (const op of oldBlock.operations) {
    const cloned = op.clone(ctx);
    newBlock.appendOp(cloned);
  }
  newBlock.params = [...oldBlock.params];
  return newBlock;
}

/**
 * Phase-2 block rewrite: walk every op already in `block` and
 * substitute operands through `valueMap`. Terminators are re-cloned
 * (their clone wires successor block refs through `blockMap`);
 * non-terminators are rewritten in place when `rewrite()` returns a
 * fresh op. Block params are remapped too if present.
 */
function phase2RewriteBlock(
  block: BasicBlock,
  environment: Environment,
  blockMap: Map<BasicBlock, BasicBlock>,
  valueMap: Map<Value, Value>,
  options: { rewriteDefinitions?: boolean } = {},
): void {
  const ctx: CloneContext = { environment, moduleIR: undefined, blockMap, valueMap };
  for (const op of [...block.operations]) {
    const rewritten = op.rewrite(valueMap, options);
    if (rewritten !== op) block.replaceOp(op, rewritten);
  }
  if (block.terminal !== undefined) {
    const rewrittenTerminal = block.terminal.clone(ctx) as TermOp;
    block.replaceOp(block.terminal, rewrittenTerminal);
  }
  if (block.params.length > 0) {
    const newParams: Value[] = [];
    let changed = false;
    for (const param of block.params) {
      const mapped = valueMap.get(param) ?? param;
      if (mapped !== param) changed = true;
      newParams.push(mapped);
    }
    if (changed) block.params = newParams;
  }
}

/**
 * Stable id for a {@link FuncOp}. Since `FuncOp` is now a
 * proper {@link Operation}; its id IS an {@link OperationId}. The historical
 * `FuncOpId` name is preserved as a type alias so the rest of the
 * codebase keeps reading naturally.
 */
export type FuncOpId = OperationId;

export function makeFuncOpId(id: number): FuncOpId {
  return makeOperationId(id);
}

type NestedFunctionInstruction =
  | ArrowFunctionExpressionOp
  | FunctionExpressionOp
  | FunctionDeclarationOp;

export interface FunctionParamSource {
  readonly target: DestructureTarget;
  readonly ops: readonly Operation[];
}

export type FunctionParam =
  | {
      readonly value: Value;
      readonly kind: "arg";
      readonly source: FunctionParamSource;
    }
  | {
      readonly value: Value;
      readonly kind: "capture";
    };

/**
 * Function operation owning one flat CFG.
 */
export class FuncOp extends Operation {
  #params: FunctionParam[];
  readonly #blocks: BasicBlock[];

  get params(): readonly FunctionParam[] {
    return this.#params;
  }

  get blocks(): readonly BasicBlock[] {
    return this.#blocks;
  }

  get entryBlock(): BasicBlock {
    const entry = this.#blocks[0];
    if (entry === undefined) throw new Error(`Function ${this.id} has no entry block`);
    return entry;
  }

  constructor(
    /**
     * The {@link ModuleIR} this function belongs to. Set at construction
     * and never changed.
     */
    public readonly moduleIR: ModuleIR,
    id: FuncOpId,
    params: readonly FunctionParam[],
    /** Whether the function is `async`. */
    public readonly async: boolean,
    /** Whether the function is a generator (`function*`, etc.). */
    public readonly generator: boolean,
    blocks: readonly BasicBlock[],
    /**
     * Maps header (test/back-edge) block IDs to label names for
     * while/for/do-while loops. These loops are reconstructed from
     * back-edges during codegen and have no dedicated structure or
     * terminal to carry the label.
     */
    public readonly blockLabels: Map<BlockId, string> = new Map(),
    /**
     * Id of the FuncOp that lexically encloses this one, or `null` for
     * top-level (module) functions. Used by the function inliner's
     * visibility check to walk the function nesting tree without
     * consulting `LexicalScope`. Set by the frontend at build time.
     */
    public readonly parentFuncOpId: FuncOpId | null = null,
    /**
     * Scope kind for the function body. `"program"` for the
     * module top-level function, `"function"` for every other function.
     */
    public readonly bodyScopeKind: LexicalScopeKind = "function",
  ) {
    super(id);
    this.#params = [...params];
    this.#blocks = [...blocks];
    const blockIds = new Set<BlockId>();
    for (const block of this.#blocks) {
      if (blockIds.has(block.id)) {
        throw new Error(`Duplicate block ${block.id} in function ${id}`);
      }
      blockIds.add(block.id);
      block.parent = this;
    }
    moduleIR.functions.set(id, this);
  }

  // -----------------------------------------------------------------------
  // Operation contract — FuncOp implements the abstract Operation methods
  // with function-specific behavior.
  // -----------------------------------------------------------------------

  /** A function-as-op has no SSA operands at the op level. */
  override operands(): Value[] {
    return [];
  }

  /** Add a block to this function's flat CFG. */
  addBlock(block: BasicBlock): void {
    if (this.#blocks.some((ownedBlock) => ownedBlock.id === block.id)) {
      throw new Error(`Block ${block.id} already belongs to function ${this.id}`);
    }
    if (block.parent !== null && block.parent !== this) {
      throw new Error(`Block ${block.id} already belongs to another function`);
    }
    block.parent = this;
    this.#blocks.push(block);
  }

  replaceParams(params: readonly FunctionParam[]): void {
    this.#params = [...params];
  }

  public *getNestedFunctionOps(): IterableIterator<NestedFunctionInstruction> {
    for (const block of this.blocks) {
      for (const instr of block.operations) {
        if (
          instr instanceof ArrowFunctionExpressionOp ||
          instr instanceof FunctionExpressionOp ||
          instr instanceof FunctionDeclarationOp
        ) {
          yield instr;
        }
      }
    }
  }

  /**
   * Rewrite every op in every block through the given value mapping.
   * Each op's `rewrite(values)` returns either itself (no change) or
   * a fresh op with substituted operands; the fresh op replaces the
   * original in the block.
   */
  rewriteAllBlocks(values: Map<Value, Value>): void {
    for (const block of this.blocks) {
      for (const op of [...block.getAllOps()]) {
        const rewritten = op.rewrite(values);
        if (rewritten !== op) block.replaceOp(op, rewritten);
      }
    }
  }

  public hasExternalReferences(): boolean {
    const ownPlaceIds = new Set<number>();

    for (const param of this.params) {
      ownPlaceIds.add(param.value.id);
      if (param.kind === "arg") {
        for (const binding of collectDestructureTargetBindingPlaces(param.source.target)) {
          ownPlaceIds.add(binding.id);
        }
        for (const op of param.source.ops) {
          for (const result of op.results()) {
            ownPlaceIds.add(result.id);
          }
        }
      }
    }
    for (const block of this.blocks) {
      for (const instr of block.operations) {
        ownPlaceIds.add(instr.place!.id);
      }
    }

    for (const block of this.blocks) {
      for (const instr of block.operations) {
        for (const place of instr.operands()) {
          if (!ownPlaceIds.has(place.id)) {
            return true;
          }
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.operands()) {
          if (!ownPlaceIds.has(place.id)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Function-level deep clone. Implements {@link Operation.clone} —
   * the only piece of the {@link CloneContext} this method consults
   * is `ctx.moduleIR`, which is treated as the target module for the
   * clone. The block / identifier maps in `ctx` are ignored because
   * function-level cloning builds its own from scratch.
   *
   * Callers that previously called `funcOp.clone(targetModule)`
   * should pass `makeCloneContext(targetModule)` to get the same
   * behavior.
   */
  override clone(ctx: CloneContext): FuncOp {
    if (ctx.moduleIR === undefined) {
      throw new Error(
        "FuncOp.clone: moduleIR is required. Build the context via makeCloneContext(moduleIR).",
      );
    }
    const targetModule = ctx.moduleIR;
    const environment = targetModule.environment;
    const blockMap = new Map<BasicBlock, BasicBlock>();
    const valueMap = new Map<Value, Value>();
    // Function-level clone builds its own cross-block context — the
    // caller-provided `ctx`'s maps are not relevant here.
    const childCtx = makeCloneContext(targetModule);
    (childCtx as { blockMap: Map<BasicBlock, BasicBlock> }).blockMap = blockMap;
    (childCtx as { valueMap: Map<Value, Value> }).valueMap = valueMap;
    const cloneValue = (value: Value): Value => {
      const cloned = environment.createValue(value.declarationId);
      cloned.originalDeclarationId = value.originalDeclarationId;
      valueMap.set(value, cloned);
      return cloned;
    };
    const clonedParamValues = this.params.map((param) => cloneValue(param.value));
    for (const param of this.params) {
      if (param.kind !== "arg") continue;
      for (const binding of collectDestructureTargetBindingPlaces(param.source.target)) {
        if (!valueMap.has(binding)) cloneValue(binding);
      }
    }
    const clonedParamOps = new Map<FunctionParam, Operation[]>();
    for (const param of this.params) {
      const ops: Operation[] = [];
      for (const op of param.kind === "arg" ? param.source.ops : []) {
        const cloned = op.clone(childCtx);
        cloned.attach(null);
        ops.push(cloned);
        if (op.place !== undefined && cloned.place !== undefined) {
          valueMap.set(op.place, cloned.place);
        }
        this.registerAdditionalDefinitionPlaces(op, valueMap, environment);
      }
      if (ops.length > 0) clonedParamOps.set(param, ops);
    }
    // Phase 1: clone every block. Terminators are rewritten in phase
    // 2 after the full block map exists.
    const oldBlocks = [...this.blocks];
    const oldToNewBlock = new Map<BasicBlock, BasicBlock>();
    for (const oldBlock of oldBlocks) {
      const newBlock = phase1CloneBlock(oldBlock, targetModule);
      blockMap.set(oldBlock, newBlock);
      oldToNewBlock.set(oldBlock, newBlock);
      for (let i = 0; i < oldBlock.operations.length; i++) {
        valueMap.set(oldBlock.operations[i]!.place!, newBlock.operations[i]!.place!);
        this.registerAdditionalDefinitionPlaces(oldBlock.operations[i]!, valueMap, environment);
      }
    }

    // Ensure block-param identifiers are in the valueMap BEFORE
    // rewriting instructions. They may reference identifiers created
    // by optimization passes that aren't instruction outputs.
    for (const oldBlock of oldBlocks) {
      for (const param of oldBlock.params) {
        if (valueMap.has(param)) continue;
        const newIdentifier = environment.createValue();
        // Carry the original variable's declarationId onto the clone's
        // param identifier so `SSAEliminator` / `LivenessAnalysis` /
        // `rebuildPhisFromBlockArgs` can locate the backing
        // declaration in the cloned function exactly the way they
        // do in the source.
        newIdentifier.originalDeclarationId = param.originalDeclarationId;
        valueMap.set(param, newIdentifier);
      }
      if (oldBlock.terminal !== undefined) {
        for (const def of oldBlock.terminal.results()) {
          if (valueMap.has(def)) continue;
          const newIdentifier = environment.createValue(def.declarationId);
          newIdentifier.originalDeclarationId = def.originalDeclarationId;
          valueMap.set(def, newIdentifier);
        }
      }
    }

    // Now rewrite all instructions with the complete valueMap.
    for (const newBlock of oldToNewBlock.values()) {
      phase2RewriteBlock(newBlock, environment, blockMap, valueMap, { rewriteDefinitions: true });
    }
    for (const [param, ops] of clonedParamOps) {
      clonedParamOps.set(
        param,
        ops.map((op) => op.rewrite(valueMap, { rewriteDefinitions: true })),
      );
    }

    const newBlocks: BasicBlock[] = [];
    for (const oldBlock of this.blocks) {
      const newBlock = oldToNewBlock.get(oldBlock);
      if (newBlock === undefined) continue;
      newBlocks.push(newBlock);
    }

    const newParams = this.params.map((param, index): FunctionParam => {
      const value = clonedParamValues[index]!;
      if (param.kind === "capture") {
        return { value, kind: "capture" };
      }
      return {
        value,
        kind: "arg",
        source: {
          target: rewriteDestructureTarget(param.source.target, valueMap, {
            rewriteDefinitions: true,
          }),
          ops: clonedParamOps.get(param) ?? [],
        },
      };
    });

    const newBlockLabels = new Map<BlockId, string>();
    for (const oldBlock of oldBlocks) {
      const label = this.blockLabels.get(oldBlock.id);
      if (label === undefined) continue;
      const newBlock = blockMap.get(oldBlock);
      if (newBlock !== undefined) newBlockLabels.set(newBlock.id, label);
    }

    const newId = makeFuncOpId(environment.nextOperationId++);
    const populated = new FuncOp(
      targetModule,
      newId,
      newParams,
      this.async,
      this.generator,
      newBlocks,
      newBlockLabels,
      this.parentFuncOpId,
      this.bodyScopeKind,
    );
    return populated;
  }

  /**
   * Rewrite all instructions, terminals, structures, and block-arg
   * operands across the entire function using the given identifier →
   * place mapping. Implements {@link Operation.rewrite} — function-
   * level rewriting is a deep, in-place sweep of every block and
   * side store; the return value is `this` to satisfy the Operation
   * contract (which permits returning a fresh op for immutable
   * rewrites).
   *
   * Block params are definitions, not reads, so they are left
   * alone; rewriteAllBlocks — the in-place sibling — does not
   * rename defs. Terminator edge args, however, are reads and are
   * rewritten as part of the terminal's own `rewrite` call above.
   */
  override rewrite(
    values: Map<Value, Value>,
    options: { skipBlock?: BasicBlock; skipInstructionIndex?: number } = {},
  ): FuncOp {
    for (const block of this.blocks) {
      const start =
        options.skipBlock === block && options.skipInstructionIndex !== undefined
          ? options.skipInstructionIndex
          : 0;
      // Rewrite non-terminator ops uniformly — structured ops are
      // ordinary ops in the same list.
      for (let i = start; i < block.operations.length; i++) {
        const op = block.operations[i];
        const rewritten = op.rewrite(values);
        if (rewritten !== op) {
          block.replaceOp(op, rewritten);
          if (rewritten.place !== undefined) {
          }
        }
      }
      if (block.terminal) {
        const rewrittenTerminal = block.terminal.rewrite(values);
        if (rewrittenTerminal !== block.terminal) {
          block.replaceOp(block.terminal, rewrittenTerminal);
        }
      }
    }

    return this;
  }

  private registerAdditionalDefinitionPlaces(
    instr: Operation,
    map: Map<Value, Value>,
    environment: ModuleIR["environment"],
  ): void {
    for (const def of instr.results()) {
      if (def === instr.place! || map.has(def)) {
        continue;
      }
      map.set(def, environment.createValue());
    }
  }
}
