import {
  BaseInstruction,
  BasicBlock,
  BinaryExpressionInstruction,
  BindingIdentifierInstruction,
  ConditionalExpressionInstruction,
  HoleInstruction,
  IdentifierId,
  LoadGlobalInstruction,
  ObjectPropertyInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { ModuleIR } from "../../../ir/core/ModuleIR";
import { ArrayPatternInstruction } from "../../../ir/instructions/pattern/ArrayPattern";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { LoadStaticPropertyInstruction } from "../../../ir/instructions/memory/LoadStaticProperty";
import { ObjectPatternInstruction } from "../../../ir/instructions/pattern/ObjectPattern";
import { Place } from "../../../ir/core/Place";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

interface DefaultInfo {
  defaultPlace: Place;
  indicesToRemove: number[];
}

type AnalyzedTarget =
  | {
      kind: "leaf";
      bi: BindingIdentifierInstruction;
      biIndex: number;
      store: StoreLocalInstruction;
      storeIndex: number;
    }
  | {
      kind: "pattern";
      bindings: AnalyzedBinding[];
    };

interface AnalyzedBinding {
  load: LoadStaticPropertyInstruction;
  loadIndex: number;
  defaultInfo: DefaultInfo | null;
  target: AnalyzedTarget;
}

interface AnalyzedGroup {
  tempStore: StoreLocalInstruction;
  tempStoreIndex: number;
  tempBI: BindingIdentifierInstruction;
  tempBIIndex: number;
  bindings: AnalyzedBinding[];
  orphanedIndices: number[];
}

export class DestructuringReconstructionPass extends BaseOptimizationPass {
  private readersOf!: Map<IdentifierId, BaseInstruction[]>;
  private indexMap!: Map<BaseInstruction, number>;
  private instrs!: BaseInstruction[];

  constructor(
    functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;
    for (const [, block] of this.functionIR.blocks) {
      if (this.reconstructInBlock(block)) {
        changed = true;
      }
    }
    return { changed };
  }

  private reconstructInBlock(block: BasicBlock): boolean {
    this.instrs = block.instructions;
    this.buildMaps();

    const groups = this.findGroups();
    if (groups.length === 0) return false;

    // Process only the first group per step. The base class fixpoint loop
    // will call step() again to find and process remaining groups after
    // indices are recalculated.
    const newInstrs = this.reconstructGroup(groups[0]);
    if (newInstrs !== null) {
      block.instructions = newInstrs;
      return true;
    }
    return false;
  }

  private buildMaps(): void {
    this.readersOf = new Map();
    this.indexMap = new Map();

    for (let i = 0; i < this.instrs.length; i++) {
      const instr = this.instrs[i];
      this.indexMap.set(instr, i);
      for (const rp of instr.getReadPlaces()) {
        const list = this.readersOf.get(rp.identifier.id) ?? [];
        list.push(instr);
        this.readersOf.set(rp.identifier.id, list);
      }
    }
  }

  // ── Analysis ─────────────────────────────────────────────────────────────

  private findGroups(): AnalyzedGroup[] {
    const groups: AnalyzedGroup[] = [];

    for (let i = 0; i < this.instrs.length; i++) {
      const instr = this.instrs[i];
      if (!(instr instanceof StoreLocalInstruction)) continue;

      const lvalId = instr.lval.identifier.id;
      const readers = this.readersOf.get(lvalId) ?? [];
      if (readers.length === 0) continue;
      if (
        !readers.every(
          (r): r is LoadStaticPropertyInstruction => r instanceof LoadStaticPropertyInstruction,
        )
      )
        continue;

      // Find the BindingIdentifier for the temp
      const tempBI = this.findBIForPlace(instr.lval, i);
      if (!tempBI) continue;

      const bindings: AnalyzedBinding[] = [];
      const orphanedIndices: number[] = [];

      for (const load of readers) {
        const loadIndex = this.indexMap.get(load);
        if (loadIndex === undefined) continue;

        const result = this.analyzeAfterLoad(load.place.identifier.id);
        if (result) {
          bindings.push({ load, loadIndex, ...result });
        } else {
          // Orphaned load (consumer was DCE'd)
          orphanedIndices.push(loadIndex);
          this.collectOrphanedBI(loadIndex, orphanedIndices);
        }
      }

      if (bindings.length === 0) continue;

      groups.push({
        tempStore: instr,
        tempStoreIndex: i,
        tempBI: tempBI.instr,
        tempBIIndex: tempBI.index,
        bindings,
        orphanedIndices,
      });
    }

    return groups;
  }

  /**
   * Analyzes what happens to a loaded value (result of LoadStaticProperty).
   * Detects: simple binding, binding with default, nested pattern, nested with default.
   */
  private analyzeAfterLoad(
    valueIdentId: IdentifierId,
  ): { defaultInfo: DefaultInfo | null; target: AnalyzedTarget } | null {
    const readers = this.readersOf.get(valueIdentId) ?? [];

    // Try to detect default-value chain: value === undefined ? default : value
    const defaultInfo = this.tryDetectDefaultChain(valueIdentId, readers);

    let effectiveIdentId: IdentifierId;
    if (defaultInfo) {
      // The ConditionalExpression result is the effective value
      const conditionalIndex = defaultInfo.indicesToRemove[defaultInfo.indicesToRemove.length - 1];
      const conditionalInstr = this.instrs[conditionalIndex] as ConditionalExpressionInstruction;
      effectiveIdentId = conditionalInstr.place.identifier.id;
    } else {
      effectiveIdentId = valueIdentId;
    }

    const effectiveReaders = this.readersOf.get(effectiveIdentId) ?? [];

    // Check for leaf binding: effective value → StoreLocal
    const storeLocal = effectiveReaders.find(
      (r): r is StoreLocalInstruction =>
        r instanceof StoreLocalInstruction && r.value.identifier.id === effectiveIdentId,
    );

    if (storeLocal) {
      const storeIndex = this.indexMap.get(storeLocal);
      if (storeIndex === undefined) return null;

      const biInfo = this.findBIForPlace(storeLocal.lval, storeIndex);
      if (!biInfo) return null;

      return {
        defaultInfo,
        target: {
          kind: "leaf",
          bi: biInfo.instr,
          biIndex: biInfo.index,
          store: storeLocal,
          storeIndex,
        },
      };
    }

    // Check for nested pattern: effective value used only as object in LoadStaticProperty
    const loads = effectiveReaders.filter(
      (r): r is LoadStaticPropertyInstruction => r instanceof LoadStaticPropertyInstruction,
    );

    if (loads.length > 0 && loads.length === effectiveReaders.length) {
      const subBindings: AnalyzedBinding[] = [];
      for (const load of loads) {
        const loadIndex = this.indexMap.get(load);
        if (loadIndex === undefined) return null;

        const subResult = this.analyzeAfterLoad(load.place.identifier.id);
        if (!subResult) return null;

        subBindings.push({ load, loadIndex, ...subResult });
      }

      return { defaultInfo, target: { kind: "pattern", bindings: subBindings } };
    }

    return null;
  }

  /**
   * Detects the lowered default-value pattern:
   *   LoadGlobal("undefined") → undef
   *   BinaryExpression(value, "===", undef) → test
   *   ConditionalExpression(test, default, value) → result
   */
  private tryDetectDefaultChain(
    valueIdentId: IdentifierId,
    readers: BaseInstruction[],
  ): DefaultInfo | null {
    // Default chain: value is read by exactly BinaryExpression + ConditionalExpression
    const binaryExpr = readers.find(
      (r): r is BinaryExpressionInstruction =>
        r instanceof BinaryExpressionInstruction &&
        r.operator === "===" &&
        r.left.identifier.id === valueIdentId,
    );
    if (!binaryExpr) return null;

    const conditionalExpr = readers.find(
      (r): r is ConditionalExpressionInstruction =>
        r instanceof ConditionalExpressionInstruction &&
        r.test.identifier.id === binaryExpr.place.identifier.id &&
        r.alternate.identifier.id === valueIdentId,
    );
    if (!conditionalExpr) return null;

    // Verify the right side of === is LoadGlobal("undefined")
    const undefinedInstr = this.instrs.find(
      (i): i is LoadGlobalInstruction =>
        i instanceof LoadGlobalInstruction &&
        i.name === "undefined" &&
        i.place.identifier.id === binaryExpr.right.identifier.id,
    );
    if (!undefinedInstr) return null;

    const undefinedIndex = this.indexMap.get(undefinedInstr)!;
    const binaryIndex = this.indexMap.get(binaryExpr)!;
    const conditionalIndex = this.indexMap.get(conditionalExpr)!;

    return {
      defaultPlace: conditionalExpr.consequent,
      indicesToRemove: [undefinedIndex, binaryIndex, conditionalIndex],
    };
  }

  private findBIForPlace(
    place: Place,
    beforeIndex: number,
  ): { instr: BindingIdentifierInstruction; index: number } | null {
    for (let j = beforeIndex - 1; j >= 0; j--) {
      const instr = this.instrs[j];
      if (instr instanceof BindingIdentifierInstruction && instr.place.id === place.id) {
        return { instr, index: j };
      }
    }
    return null;
  }

  private collectOrphanedBI(loadIndex: number, orphanedIndices: number[]): void {
    for (let j = loadIndex + 1; j < this.instrs.length; j++) {
      const instr = this.instrs[j];
      if (instr instanceof BindingIdentifierInstruction) {
        const biIdentId = instr.place.identifier.id;
        const biReaders = this.readersOf.get(biIdentId) ?? [];
        if (!biReaders.some((r) => r instanceof StoreLocalInstruction)) {
          orphanedIndices.push(j);
        }
        break;
      }
      if (!(instr instanceof LoadStaticPropertyInstruction)) break;
    }
  }

  // ── Reconstruction ───────────────────────────────────────────────────────

  private reconstructGroup(group: AnalyzedGroup): BaseInstruction[] | null {
    const indicesToRemove = new Set<number>();

    // Remove temp BI + StoreLocal
    indicesToRemove.add(group.tempBIIndex);
    indicesToRemove.add(group.tempStoreIndex);

    // Collect all indices from the binding tree
    this.collectIndicesToRemove(group.bindings, indicesToRemove);
    for (const idx of group.orphanedIndices) {
      indicesToRemove.add(idx);
    }

    // Build the replacement pattern instructions
    const { instrs: replacementInstrs, place: patternPlace } = this.buildPattern(group.bindings);

    // Create the reconstructed StoreLocal with pattern as lval
    const storeIdentifier = this.moduleIR.environment.createIdentifier();
    const storePlace = this.moduleIR.environment.createPlace(storeIdentifier);
    const storeInstruction = this.moduleIR.environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      group.tempStore.nodePath,
      patternPlace,
      group.tempStore.value,
      group.tempStore.type,
    );
    replacementInstrs.push(storeInstruction);

    // Build the new instruction list.
    // Insert replacement AFTER the last removed index so that surviving
    // intermediate instructions (e.g. default value literals) naturally
    // appear before the pattern instructions that reference them.
    const maxRemovedIndex = Math.max(...indicesToRemove);
    const newInstrs: BaseInstruction[] = [];
    let inserted = false;

    for (let i = 0; i < this.instrs.length; i++) {
      if (indicesToRemove.has(i)) {
        if (!inserted && i === maxRemovedIndex) {
          newInstrs.push(...replacementInstrs);
          inserted = true;
        }
        continue;
      }
      newInstrs.push(this.instrs[i]);
    }

    if (!inserted) {
      newInstrs.push(...replacementInstrs);
    }

    return newInstrs;
  }

  private collectIndicesToRemove(bindings: AnalyzedBinding[], indices: Set<number>): void {
    for (const binding of bindings) {
      indices.add(binding.loadIndex);
      if (binding.defaultInfo) {
        for (const idx of binding.defaultInfo.indicesToRemove) {
          indices.add(idx);
        }
      }
      if (binding.target.kind === "leaf") {
        indices.add(binding.target.biIndex);
        indices.add(binding.target.storeIndex);
      } else {
        this.collectIndicesToRemove(binding.target.bindings, indices);
      }
    }
  }

  /**
   * Builds pattern instructions for a set of bindings.
   * Returns the generated instructions and the top-level pattern Place.
   */
  private buildPattern(bindings: AnalyzedBinding[]): { instrs: BaseInstruction[]; place: Place } {
    const isArray = bindings.every((b) => /^\d+$/.test(b.load.property));
    return isArray ? this.buildArrayPattern(bindings) : this.buildObjectPattern(bindings);
  }

  private buildArrayPattern(bindings: AnalyzedBinding[]): {
    instrs: BaseInstruction[];
    place: Place;
  } {
    const bindingByIndex = new Map(bindings.map((b) => [Number(b.load.property), b]));
    const maxIndex = Math.max(...bindingByIndex.keys());
    const instrs: BaseInstruction[] = [];
    const elementPlaces: Place[] = [];

    for (let idx = 0; idx <= maxIndex; idx++) {
      const binding = bindingByIndex.get(idx);
      if (binding) {
        const result = this.buildBindingPlace(binding);
        instrs.push(...result.instrs);
        elementPlaces.push(result.place);
      } else {
        // Hole
        const holeId = this.moduleIR.environment.createIdentifier();
        const holePlace = this.moduleIR.environment.createPlace(holeId);
        const holeInstr = this.moduleIR.environment.createInstruction(
          HoleInstruction,
          holePlace,
          undefined,
        );
        instrs.push(holeInstr);
        elementPlaces.push(holePlace);
      }
    }

    const patternId = this.moduleIR.environment.createIdentifier();
    const patternPlace = this.moduleIR.environment.createPlace(patternId);
    instrs.push(
      this.moduleIR.environment.createInstruction(
        ArrayPatternInstruction,
        patternPlace,
        undefined,
        elementPlaces,
      ),
    );

    return { instrs, place: patternPlace };
  }

  private buildObjectPattern(bindings: AnalyzedBinding[]): {
    instrs: BaseInstruction[];
    place: Place;
  } {
    const sorted = [...bindings].sort((a, b) => a.loadIndex - b.loadIndex);
    const instrs: BaseInstruction[] = [];
    const propertyPlaces: Place[] = [];

    for (const binding of sorted) {
      const { instrs: bindingInstrs, place: valuePlace } = this.buildBindingPlace(binding);
      instrs.push(...bindingInstrs);

      // Create key BI
      const keyId = this.moduleIR.environment.createIdentifier();
      keyId.name = binding.load.property;
      const keyPlace = this.moduleIR.environment.createPlace(keyId);
      instrs.push(
        this.moduleIR.environment.createInstruction(
          BindingIdentifierInstruction,
          keyPlace,
          undefined,
        ),
      );

      // Create ObjectProperty
      const propId = this.moduleIR.environment.createIdentifier();
      const propPlace = this.moduleIR.environment.createPlace(propId);
      instrs.push(
        this.moduleIR.environment.createInstruction(
          ObjectPropertyInstruction,
          propPlace,
          undefined,
          keyPlace,
          valuePlace,
          false,
          false,
        ),
      );
      propertyPlaces.push(propPlace);
    }

    const patternId = this.moduleIR.environment.createIdentifier();
    const patternPlace = this.moduleIR.environment.createPlace(patternId);
    instrs.push(
      this.moduleIR.environment.createInstruction(
        ObjectPatternInstruction,
        patternPlace,
        undefined,
        propertyPlaces,
      ),
    );

    return { instrs, place: patternPlace };
  }

  /**
   * Builds the Place for a single binding, wrapping with AssignmentPattern if it has a default.
   */
  private buildBindingPlace(binding: AnalyzedBinding): { instrs: BaseInstruction[]; place: Place } {
    let innerInstrs: BaseInstruction[];
    let innerPlace: Place;

    if (binding.target.kind === "leaf") {
      // Re-emit the binding identifier
      innerInstrs = [binding.target.bi];
      innerPlace = binding.target.bi.place;
    } else {
      // Nested pattern — recurse
      const result = this.buildPattern(binding.target.bindings);
      innerInstrs = result.instrs;
      innerPlace = result.place;
    }

    if (binding.defaultInfo) {
      // Wrap in AssignmentPattern(innerPlace, defaultPlace)
      const assignmentId = this.moduleIR.environment.createIdentifier();
      const assignmentPlace = this.moduleIR.environment.createPlace(assignmentId);
      const assignmentInstr = this.moduleIR.environment.createInstruction(
        AssignmentPatternInstruction,
        assignmentPlace,
        undefined,
        innerPlace,
        binding.defaultInfo.defaultPlace,
      );
      return { instrs: [...innerInstrs, assignmentInstr], place: assignmentPlace };
    }

    return { instrs: innerInstrs, place: innerPlace };
  }
}
