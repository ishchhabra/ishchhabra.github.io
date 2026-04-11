import {
  getBackEdges,
  getDominanceFrontier,
  getDominators,
  getImmediateDominators,
  getPredecessors,
  getSuccessors,
} from "../../frontend/cfg";
import type { Phi } from "../../pipeline/ssa/Phi";
import { BaseInstruction } from "../base";
import { FunctionDeclarationInstruction } from "../instructions/declaration/FunctionDeclaration";
import { ArrowFunctionExpressionInstruction } from "../instructions/value/ArrowFunctionExpression";
import { FunctionExpressionInstruction } from "../instructions/value/FunctionExpression";
import { BasicBlock, BlockId } from "./Block";
import { type DestructureTarget, rewriteDestructureTarget } from "./Destructure";
import { Identifier } from "./Identifier";
import { ModuleIR } from "./ModuleIR";
import { Place } from "./Place";
import { BaseStructure, TernaryStructure } from "./Structure";

/**
 * Simulated opaque type for FunctionIR to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueFunctionIRId = Symbol();
export type FunctionIRId = number & { [opaqueFunctionIRId]: "FunctionIRId" };

export function makeFunctionIRId(id: number): FunctionIRId {
  return id as FunctionIRId;
}

export interface FunctionSource {
  header: BaseInstruction[];
  params: DestructureTarget[];
}

export interface FunctionRuntime {
  params: Place[];
  paramTargets: DestructureTarget[];
  paramBindings: Place[][];
  prologue: BaseInstruction[];
  captureParams: Place[];
}

type NestedFunctionInstruction =
  | ArrowFunctionExpressionInstruction
  | FunctionExpressionInstruction
  | FunctionDeclarationInstruction;

export class FunctionIR {
  public predecessors!: Map<BlockId, Set<BlockId>>;
  public successors!: Map<BlockId, Set<BlockId>>;
  public dominators!: Map<BlockId, Set<BlockId>>;
  public immediateDominators!: Map<BlockId, BlockId | undefined>;
  public dominanceFrontier!: Map<BlockId, Set<BlockId>>;
  public backEdges!: Map<BlockId, Set<BlockId>>;

  /**
   * SSA phi nodes for this function. Set by SSABuilder after SSA
   * construction. Empty before SSA and after SSA elimination.
   */
  public phis: Set<Phi> = new Set();


  get entryBlockId(): BlockId {
    return this.blocks.keys().next().value!;
  }

  get entryBlock(): BasicBlock {
    return this.blocks.get(this.entryBlockId)!;
  }

  get exitBlockId(): BlockId {
    for (const [blockId, successors] of this.successors) {
      if (successors.size === 0) {
        return blockId;
      }
    }

    throw new Error("No exit block found");
  }

  get exitBlock(): BasicBlock {
    return this.blocks.get(this.exitBlockId)!;
  }

  private get runtimePrologueMatchesSourceHeader(): boolean {
    return (
      this.runtime.prologue.length === this.source.header.length &&
      this.runtime.prologue.every((instruction, index) => instruction === this.source.header[index])
    );
  }

  constructor(
    /**
     * The {@link ModuleIR} this function belongs to. Set at construction
     * and never changed: a function's owning module is a primary fact
     * about it, the same way a block belongs to a function. Cloning into
     * a different module produces a new {@link FunctionIR} with its own
     * `moduleIR` set to the target — the source's `moduleIR` is never
     * mutated.
     *
     * The constructor self-registers `this` in `moduleIR.functions`, so
     * any `new FunctionIR(...)` is automatically visible to the pipeline
     * and to {@link CodeGenerator}. There is no separate "register" step.
     */
    public readonly moduleIR: ModuleIR,
    public readonly id: FunctionIRId,
    public readonly source: FunctionSource,
    public readonly runtime: FunctionRuntime,
    /** Whether the function is `async`. */
    public readonly async: boolean,
    /** Whether the function is a generator (`function*`, etc.). */
    public readonly generator: boolean,
    public blocks: Map<BlockId, BasicBlock>,
    public structures: Map<BlockId, BaseStructure>,
    /**
     * Maps header (test/back-edge) block IDs to label names for
     * while/for/do-while loops. These loops are reconstructed from
     * back-edges during codegen and have no dedicated structure or
     * terminal to carry the label.
     *
     * Other labeled constructs carry their label structurally:
     * - `ForInStructure.label` / `ForOfStructure.label`
     * - `LabeledBlockStructure.label`
     * - `SwitchTerminal.label`
     */
    public readonly blockLabels: Map<BlockId, string> = new Map(),
  ) {
    this.computeCFG();
    for (const structure of this.structures.values()) {
      FunctionIR.registerStructure(structure);
    }
    moduleIR.functions.set(id, this);
  }

  private computeCFG() {
    this.predecessors = getPredecessors(this.blocks, this.structures);
    this.successors = getSuccessors(this.predecessors);
    this.dominators = getDominators(this.predecessors, this.entryBlockId);
    this.immediateDominators = getImmediateDominators(this.dominators);
    this.dominanceFrontier = getDominanceFrontier(this.predecessors, this.immediateDominators);
    this.backEdges = getBackEdges(this.blocks, this.dominators, this.predecessors);
  }

  public recomputeCFG() {
    this.computeCFG();
  }

  public *getRuntimeInstructionLists(): IterableIterator<BaseInstruction[]> {
    yield this.runtime.prologue;
    for (const block of this.blocks.values()) {
      yield block.instructions;
    }
  }

  public *getDefinitionInstructionLists(): IterableIterator<BaseInstruction[]> {
    yield this.runtime.prologue;
    for (const block of this.blocks.values()) {
      yield block.instructions;
    }
  }

  public *getRuntimeInstructions(): IterableIterator<BaseInstruction> {
    for (const instructions of this.getRuntimeInstructionLists()) {
      for (const instruction of instructions) {
        yield instruction;
      }
    }
  }

  public *getNestedFunctionInstructions(): IterableIterator<NestedFunctionInstruction> {
    for (const instr of this.runtime.prologue) {
      if (
        instr instanceof ArrowFunctionExpressionInstruction ||
        instr instanceof FunctionExpressionInstruction ||
        instr instanceof FunctionDeclarationInstruction
      ) {
        yield instr;
      }
    }
    for (const block of this.blocks.values()) {
      for (const instr of block.instructions) {
        if (
          instr instanceof ArrowFunctionExpressionInstruction ||
          instr instanceof FunctionExpressionInstruction ||
          instr instanceof FunctionDeclarationInstruction
        ) {
          yield instr;
        }
      }
    }
  }

  /**
   * Look up a block by ID, throwing with context if not found.
   */
  getBlock(blockId: BlockId): BasicBlock {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found in function ${this.id}`);
    }
    return block;
  }

  /**
   * Rewrite all instructions and terminals across all blocks using the
   * given identifier → place mapping (delegates to {@link BasicBlock.rewriteAll}).
   */
  rewriteAllBlocks(values: Map<Identifier, Place>): void {
    for (const block of this.blocks.values()) {
      block.rewriteAll(values);
    }
  }

  public hasExternalReferences(): boolean {
    const ownPlaceIds = new Set<number>();

    for (const param of this.runtime.params) {
      ownPlaceIds.add(param.identifier.id);
    }
    for (const bindings of this.runtime.paramBindings) {
      for (const binding of bindings) {
        ownPlaceIds.add(binding.identifier.id);
      }
    }
    for (const captureParam of this.runtime.captureParams) {
      ownPlaceIds.add(captureParam.identifier.id);
    }
    for (const instr of this.runtime.prologue) {
      ownPlaceIds.add(instr.place.identifier.id);
    }
    for (const [, block] of this.blocks) {
      for (const instr of block.instructions) {
        ownPlaceIds.add(instr.place.identifier.id);
      }
    }

    for (const instr of this.runtime.prologue) {
      for (const place of instr.getOperands()) {
        if (!ownPlaceIds.has(place.identifier.id)) {
          return true;
        }
      }
    }
    for (const [, block] of this.blocks) {
      for (const instr of block.instructions) {
        for (const place of instr.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  public findOwningTernary(
    blockId: BlockId,
  ): { headerBlockId: BlockId; structure: TernaryStructure } | null {
    for (const [headerBlockId, structure] of this.structures) {
      if (
        structure instanceof TernaryStructure &&
        (structure.consequent === blockId || structure.alternate === blockId)
      ) {
        return { headerBlockId, structure };
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Structure mutations — maintain Identifier.uses
  // -----------------------------------------------------------------------

  /** Add or replace a structure, maintaining use-chains. */
  setStructure(blockId: BlockId, structure: BaseStructure): void {
    const old = this.structures.get(blockId);
    if (old) FunctionIR.unregisterStructure(old);
    FunctionIR.registerStructure(structure);
    this.structures.set(blockId, structure);
  }

  /** Remove a structure and unregister its use-chains. */
  deleteStructure(blockId: BlockId): void {
    const old = this.structures.get(blockId);
    if (old) FunctionIR.unregisterStructure(old);
    this.structures.delete(blockId);
  }

  private static registerStructure(s: BaseStructure): void {
    for (const place of s.getOperands()) {
      place.identifier.uses.add(s);
    }
    for (const place of s.getDefs()) {
      place.identifier.uses.add(s);
    }
  }

  private static unregisterStructure(s: BaseStructure): void {
    for (const place of s.getOperands()) {
      place.identifier.uses.delete(s);
    }
    for (const place of s.getDefs()) {
      place.identifier.uses.delete(s);
    }
  }

  public clone(targetModule: ModuleIR = this.moduleIR): FunctionIR {
    const environment = targetModule.environment;
    const blockMap = new Map<BlockId, BlockId>();
    const identifierMap = new Map<Identifier, Place>();
    const newBlocks = new Map<BlockId, BasicBlock>();
    const cloneInstructionList = (instructions: BaseInstruction[]): BaseInstruction[] => {
      const clonedInstructions: BaseInstruction[] = [];
      for (const instr of instructions) {
        const cloned = instr.clone(targetModule);
        identifierMap.set(instr.place.identifier, cloned.place);
        this.registerAdditionalDefinitionPlaces(instr, identifierMap, environment);
        clonedInstructions.push(cloned);
      }
      return clonedInstructions;
    };

    const newSourceHeader = cloneInstructionList(this.source.header);
    const newRuntimePrologue = this.runtimePrologueMatchesSourceHeader
      ? newSourceHeader
      : cloneInstructionList(this.runtime.prologue);

    for (const [oldBlockId, oldBlock] of this.blocks) {
      const newBlock = oldBlock.clone(targetModule);
      blockMap.set(oldBlockId, newBlock.id);
      newBlocks.set(newBlock.id, newBlock);
      for (let i = 0; i < oldBlock.instructions.length; i++) {
        identifierMap.set(
          oldBlock.instructions[i].place.identifier,
          newBlock.instructions[i].place,
        );
        this.registerAdditionalDefinitionPlaces(
          oldBlock.instructions[i],
          identifierMap,
          environment,
        );
      }
    }

    // Ensure structure and phi identifiers are in the identifierMap
    // BEFORE rewriting instructions.
    // Structures (e.g. TernaryStructure.resultPlace) and phi places may
    // reference identifiers created by optimization passes that aren't
    // instruction outputs — they'd be missed by the instruction-based
    // identifierMap population above. Without remapping, the clone's
    // structures would share PlaceIds with the original, causing
    // collisions in CodeGenerator's shared places map.
    for (const structure of this.structures.values()) {
      for (const place of [...structure.getOperands(), ...structure.getDefs()]) {
        if (!identifierMap.has(place.identifier)) {
          identifierMap.set(
            place.identifier,
            environment.createPlace(environment.createIdentifier()),
          );
        }
      }
    }
    for (const phi of this.phis) {
      if (!identifierMap.has(phi.place.identifier)) {
        identifierMap.set(
          phi.place.identifier,
          environment.createPlace(environment.createIdentifier()),
        );
      }
    }

    // Now rewrite all instructions with the complete identifierMap.
    for (let i = 0; i < newSourceHeader.length; i++) {
      newSourceHeader[i] = newSourceHeader[i].rewrite(identifierMap, {
        rewriteDefinitions: true,
      });
    }
    if (newRuntimePrologue !== newSourceHeader) {
      for (let i = 0; i < newRuntimePrologue.length; i++) {
        newRuntimePrologue[i] = newRuntimePrologue[i].rewrite(identifierMap, {
          rewriteDefinitions: true,
        });
      }
    }
    for (const newBlock of newBlocks.values()) {
      newBlock.rewrite(environment, blockMap, identifierMap, { rewriteDefinitions: true });
    }

    const newStructures = new Map<BlockId, BaseStructure>();
    for (const [oldBlockId, oldStructure] of this.structures) {
      newStructures.set(blockMap.get(oldBlockId)!, oldStructure.clone(blockMap, identifierMap));
    }
    const newPhis = new Set<Phi>();
    for (const oldPhi of this.phis) {
      newPhis.add(oldPhi.clone(blockMap, identifierMap));
    }

    const remapPlace = (place: Place): Place => identifierMap.get(place.identifier) ?? place;
    const remapTarget = (target: DestructureTarget): DestructureTarget =>
      rewriteDestructureTarget(target, identifierMap, { rewriteDefinitions: true });
    const newSourceParams = this.source.params.map(remapTarget);
    const newRuntimeParams = this.runtime.params.map(remapPlace);
    const newRuntimeParamTargets = this.runtime.paramTargets.map(remapTarget);
    const newRuntimeParamBindings = this.runtime.paramBindings.map((bs) => bs.map(remapPlace));
    const newRuntimeCaptureParams = this.runtime.captureParams.map(remapPlace);
    const newBlockLabels = new Map<BlockId, string>();
    for (const [oldBlockId, label] of this.blockLabels) {
      newBlockLabels.set(blockMap.get(oldBlockId)!, label);
    }

    const newId = makeFunctionIRId(environment.nextFunctionId++);
    const populated = new FunctionIR(
      targetModule,
      newId,
      { header: newSourceHeader, params: newSourceParams },
      {
        params: newRuntimeParams,
        paramTargets: newRuntimeParamTargets,
        paramBindings: newRuntimeParamBindings,
        prologue: newRuntimePrologue,
        captureParams: newRuntimeCaptureParams,
      },
      this.async,
      this.generator,
      newBlocks,
      newStructures,
      newBlockLabels,
    );
    populated.phis = newPhis;

    return populated;
  }

  /**
   * Rewrite all instructions, terminals, structures, and phis across
   * the entire function using the given identifier → place mapping.
   */
  public rewrite(
    values: Map<Identifier, Place>,
    options: { skipBlock?: BasicBlock; skipInstructionIndex?: number } = {},
  ): void {
    for (const [, block] of this.blocks) {
      const start =
        options.skipBlock === block && options.skipInstructionIndex !== undefined
          ? options.skipInstructionIndex
          : 0;
      for (let i = start; i < block.instructions.length; i++) {
        const rewritten = block.instructions[i].rewrite(values);
        if (rewritten !== block.instructions[i]) {
          block.replaceInstruction(i, rewritten);
          this.moduleIR.environment.placeToInstruction.set(rewritten.place.id, rewritten);
        }
      }
      if (block.terminal) {
        block.replaceTerminal(block.terminal.rewrite(values));
      }
    }

    for (const [blockId, structure] of this.structures) {
      const rewritten = structure.rewrite(values);
      if (rewritten !== structure) {
        this.setStructure(blockId, rewritten);
      }
    }

    for (const phi of this.phis) {
      for (const [phiBlockId, operandPlace] of phi.operands) {
        const rewritten = values.get(operandPlace.identifier);
        if (rewritten) {
          phi.operands.set(phiBlockId, rewritten);
        }
      }
    }
  }

  private registerAdditionalDefinitionPlaces(
    instr: BaseInstruction,
    map: Map<Identifier, Place>,
    environment: ModuleIR["environment"],
  ): void {
    for (const def of instr.getDefs()) {
      if (def.identifier === instr.place.identifier || map.has(def.identifier)) {
        continue;
      }
      map.set(def.identifier, environment.createPlace(environment.createIdentifier()));
    }
  }

}
