import { Environment } from "../../../environment";
import {
  BasicBlock,
  Identifier,
  IdentifierId,
  LiteralInstruction,
  LoadDynamicPropertyInstruction,
  LoadLocalInstruction,
  LoadStaticPropertyInstruction,
  ObjectExpressionInstruction,
  ObjectDestructureInstruction,
  ObjectPatternInstruction,
  ObjectPropertyInstruction,
  RestElementInstruction,
  StoreLocalInstruction,
  CopyInstruction,
  UnaryExpressionInstruction,
  makeInstructionId,
} from "../../../ir";
import { Place } from "../../../ir/core/Place";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { SpreadElementInstruction } from "../../../ir/instructions/SpreadElement";
import { StoreStaticPropertyInstruction } from "../../../ir/instructions/memory/StoreStaticProperty";
import { StoreDynamicPropertyInstruction } from "../../../ir/instructions/memory/StoreDynamicProperty";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import { EscapeAnalysis } from "../../analysis/EscapeAnalysis";

/**
 * Scalar Replacement of Aggregates — decomposes object aggregates into
 * individual scalar values.
 *
 * ## Destructuring SROA (original)
 *
 * Transforms:
 * ```
 *   const { a, b } = { a: 2, b: 3 };
 * ```
 * Into:
 * ```
 *   const a = 2;
 *   const b = 3;
 * ```
 *
 * ## Member-access SROA (escape-analysis–driven)
 *
 * Transforms:
 * ```
 *   const obj = { a: 1, b: 2 };
 *   console.log(obj.a, obj.b);
 * ```
 * Into:
 * ```
 *   const obj_a = 1;
 *   const obj_b = 2;
 *   console.log(obj_a, obj_b);
 * ```
 *
 * The member-access variant requires escape analysis to prove the object
 * never leaves the local scope and is never modified after creation.
 *
 * ## Store-to-load forwarding (intra-block)
 *
 * Transforms:
 * ```
 *   const obj = { a: 1, b: 2 };
 *   obj.a = 10;
 *   console.log(obj.a);
 * ```
 * Into:
 * ```
 *   const obj = { a: 1, b: 2 };
 *   obj.a = 10;
 *   console.log(10);
 * ```
 *
 * Tracks property values through stores within the same basic block.
 * Also eliminates dead property loads (unused reads on non-escaping
 * object literals are provably side-effect-free).
 *
 * **Soundness conditions** for destructuring SROA:
 *
 *   1. The RHS is a syntactic `ObjectExpressionInstruction` — a literal
 *      `{ ... }` that is guaranteed free of getters and Proxy traps.
 *   2. The object contains no spread elements (`SpreadElementInstruction`).
 *   3. Every property in both the object and the pattern has a
 *      non-computed, literal key.
 *   4. The pattern contains no rest elements (`RestElementInstruction`).
 *   5. The pattern contains no default values (`AssignmentPatternInstruction`).
 *   6. Every pattern key has a corresponding key in the object literal
 *      (no implicit `undefined` bindings).
 *
 * **Soundness conditions** for member-access SROA:
 *
 *   1. The object is a syntactic `ObjectExpressionInstruction`.
 *   2. The object does not escape (EscapeAnalysis reports NoEscape).
 *   3. No `StoreStaticProperty` / `StoreDynamicProperty` writes to the object.
 *   4. The object contains no spread elements and all keys are literal.
 *   5. Every `LoadStaticProperty` accessing the object has a matching key.
 *
 * Pattern and object instructions that become dead after replacement are
 * left for {@link LateDeadCodeEliminationPass} / {@link DeadCodeEliminationPass}
 * to clean up.
 */
export class ScalarReplacementOfAggregatesPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    if (this.stepDestructuring()) changed = true;
    if (this.stepMemberAccess()) changed = true;
    if (this.stepStoreToLoadForwarding()) changed = true;
    if (this.stepDeadPropertyLoadElimination()) changed = true;

    return { changed };
  }

  // ---------------------------------------------------------------------------
  // Destructuring SROA (original implementation)
  // ---------------------------------------------------------------------------

  private stepDestructuring(): boolean {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        let valuePlace: Place;
        let storeKind: StoreLocalInstruction["kind"];
        let declarationKind: StoreLocalInstruction["type"];
        let pattern: ObjectPatternInstruction | ObjectDestructureInstruction | null = null;

        if (instr instanceof ObjectDestructureInstruction) {
          valuePlace = instr.value;
          storeKind = instr.kind;
          declarationKind = instr.declarationKind ?? "const";
          pattern = instr;
        } else if (instr instanceof StoreLocalInstruction && instr.bindings.length > 0) {
          valuePlace = instr.value;
          storeKind = instr.kind;
          declarationKind = instr.type;
          pattern = this.findObjectPattern(block, i, instr.lval);
        } else {
          continue;
        }

        if (!pattern) continue;

        const objectExpr = valuePlace.identifier.definer;
        if (!(objectExpr instanceof ObjectExpressionInstruction)) continue;

        const objMap = this.buildObjectKeyToValue(objectExpr);
        if (!objMap) continue;

        const replacements =
          pattern instanceof ObjectDestructureInstruction
            ? this.matchDestructureToObject(pattern, objMap)
            : this.matchPatternToObject(pattern, objMap);
        if (!replacements) continue;

        block.removeInstructionAt(i);

        for (let j = 0; j < replacements.length; j++) {
          const { lval, value } = replacements[j];
          const id = makeInstructionId(this.environment.nextInstructionId++);
          const identifier = this.environment.createIdentifier();
          const place = this.environment.createPlace(identifier);
          const scalar = new StoreLocalInstruction(
            id,
            place,
            lval,
            value,
            declarationKind,
            storeKind,
          );
          block.insertInstructionAt(i + j, scalar);
        }

        i += replacements.length - 1;
        changed = true;
      }
    }

    return changed;
  }

  // ---------------------------------------------------------------------------
  // Member-access SROA (escape-analysis–driven)
  // ---------------------------------------------------------------------------

  private stepMemberAccess(): boolean {
    const escapeResult = this.AM.get(EscapeAnalysis, this.functionIR);

    // 1. Find non-escaping, unmodified object literals.
    const candidates = new Map<
      IdentifierId,
      { objExpr: ObjectExpressionInstruction; propMap: Map<string, Place> }
    >();

    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        if (!(instr instanceof ObjectExpressionInstruction)) continue;
        if (!escapeResult.doesNotEscape(instr.place.identifier.id)) continue;

        const propMap = this.buildObjectKeyToValue(instr);
        if (!propMap) continue;

        candidates.set(instr.place.identifier.id, { objExpr: instr, propMap });
      }
    }

    if (candidates.size === 0) return false;

    // Remove candidates that have property writes.
    this.removeModifiedObjects(candidates);
    if (candidates.size === 0) return false;

    // 2. Build a rewrite map: LoadStaticProperty result → property value.
    //    Also collect the LoadStaticProperty instructions to remove.
    const rewrites = new Map<Identifier, Place>();
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        if (!(instr instanceof LoadStaticPropertyInstruction)) continue;

        const objExpr = this.resolveToObjectExpression(instr.object);
        if (!objExpr) continue;

        const candidate = candidates.get(objExpr.place.identifier.id);
        if (!candidate) continue;

        const value = candidate.propMap.get(instr.property);
        if (value === undefined) continue;

        rewrites.set(instr.place.identifier, value);

        let indices = toRemove.get(block);
        if (!indices) {
          indices = [];
          toRemove.set(block, indices);
        }
        indices.push(i);
      }
    }

    if (rewrites.size === 0) return false;

    // 3. Remove the LoadStaticProperty instructions (descending order per block).
    for (const [block, indices] of toRemove) {
      indices.sort((a, b) => b - a);
      for (const index of indices) {
        block.removeInstructionAt(index);
      }
    }

    // 4. Rewrite all uses of the removed loads to point to the property values.
    for (const block of this.functionIR.blocks.values()) {
      block.rewriteAll(rewrites);
    }

    // Also rewrite phi operands.
    for (const phi of this.functionIR.phis) {
      for (const [blockId, place] of phi.operands) {
        const rewritten = rewrites.get(place.identifier);
        if (rewritten) {
          phi.operands.set(blockId, rewritten);
        }
      }
    }

    return true;
  }

  /**
   * Trace an identifier through value-forwarding instructions
   * (LoadLocal, StoreLocal, CopyInstruction) back to its origin.
   * Returns the ObjectExpressionInstruction if found, null otherwise.
   */
  private resolveToObjectExpression(place: Place): ObjectExpressionInstruction | null {
    // oxlint-disable-next-line typescript/no-explicit-any
    let current: any = place.identifier.definer;
    for (let depth = 0; depth < 10 && current; depth++) {
      if (current instanceof ObjectExpressionInstruction) return current;
      if (current instanceof LoadLocalInstruction) {
        current = current.value.identifier.definer;
      } else if (current instanceof CopyInstruction) {
        current = current.value.identifier.definer;
      } else if (current instanceof StoreLocalInstruction) {
        current = current.value.identifier.definer;
      } else {
        break;
      }
    }
    return null;
  }

  /**
   * Remove candidates that are modified anywhere in the function.
   *
   * Detects:
   * - `StoreStaticProperty` / `StoreDynamicProperty` on the object
   * - `delete obj.prop` — a `UnaryExpression("delete")` whose argument
   *   is a `LoadStaticProperty` on the object
   */
  private removeModifiedObjects(
    candidates: Map<
      IdentifierId,
      { objExpr: ObjectExpressionInstruction; propMap: Map<string, Place> }
    >,
  ): void {
    for (const block of this.functionIR.blocks.values()) {
      for (const instr of block.instructions) {
        // Direct property stores.
        if (
          instr instanceof StoreStaticPropertyInstruction ||
          instr instanceof StoreDynamicPropertyInstruction
        ) {
          const objExpr = this.resolveToObjectExpression(instr.object);
          if (objExpr) {
            candidates.delete(objExpr.place.identifier.id);
          }
        }

        // `delete obj.prop` — the delete argument is a LoadStaticProperty.
        if (instr instanceof UnaryExpressionInstruction && instr.operator === "delete") {
          const argDefiner = instr.argument.identifier.definer;
          if (argDefiner instanceof LoadStaticPropertyInstruction) {
            const objExpr = this.resolveToObjectExpression(argDefiner.object);
            if (objExpr) {
              candidates.delete(objExpr.place.identifier.id);
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Store-to-load forwarding (intra-block)
  // ---------------------------------------------------------------------------

  /**
   * Intra-block store-to-load forwarding for non-escaping object literals.
   *
   * Walks each basic block forward, maintaining a "virtual object" state
   * that tracks the current value of each property. When a
   * `LoadStaticProperty` is encountered, the tracked value is forwarded
   * and the load is eliminated.
   *
   * This handles objects WITH property writes (which `stepMemberAccess`
   * cannot). It is limited to intra-block: the virtual state is not
   * carried across control-flow edges.
   */
  private stepStoreToLoadForwarding(): boolean {
    const escapeResult = this.AM.get(EscapeAnalysis, this.functionIR);
    const rewrites = new Map<Identifier, Place>();
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.functionIR.blocks.values()) {
      // Virtual state: objectId → (propertyKey → current value Place)
      const virtualState = new Map<IdentifierId, Map<string, Place>>();

      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        // Initialize virtual state when we see a non-escaping object literal.
        if (instr instanceof ObjectExpressionInstruction) {
          if (!escapeResult.doesNotEscape(instr.place.identifier.id)) continue;
          const propMap = this.buildObjectKeyToValue(instr);
          if (propMap) {
            virtualState.set(instr.place.identifier.id, new Map(propMap));
          }
          continue;
        }

        // Static property store → update the tracked value.
        if (instr instanceof StoreStaticPropertyInstruction) {
          const objId = this.resolveToObjectId(instr.object);
          if (objId !== null) {
            const state = virtualState.get(objId);
            if (state) {
              state.set(instr.property, instr.value);
            }
          }
          continue;
        }

        // Dynamic property store → invalidate all tracked properties
        // (we don't know which key was written).
        if (instr instanceof StoreDynamicPropertyInstruction) {
          const objId = this.resolveToObjectId(instr.object);
          if (objId !== null) {
            virtualState.delete(objId);
          }
          continue;
        }

        // `delete obj.prop` → invalidate the specific property.
        if (instr instanceof UnaryExpressionInstruction && instr.operator === "delete") {
          const argDefiner = instr.argument.identifier.definer;
          if (argDefiner instanceof LoadStaticPropertyInstruction) {
            const objId = this.resolveToObjectId(argDefiner.object);
            if (objId !== null) {
              const state = virtualState.get(objId);
              if (state) {
                state.delete(argDefiner.property);
              }
            }
          }
          continue;
        }

        // Static property load → forward if we have a tracked value.
        if (instr instanceof LoadStaticPropertyInstruction) {
          const objId = this.resolveToObjectId(instr.object);
          if (objId === null) continue;
          const state = virtualState.get(objId);
          if (!state) continue;
          const value = state.get(instr.property);
          if (value === undefined) continue;

          // Don't forward if the load feeds a `delete` expression —
          // `delete` needs the actual property reference, not the value.
          if (this.feedsDeleteExpression(instr)) continue;

          rewrites.set(instr.place.identifier, value);

          let indices = toRemove.get(block);
          if (!indices) {
            indices = [];
            toRemove.set(block, indices);
          }
          indices.push(i);
          continue;
        }
      }
    }

    if (rewrites.size === 0) return false;

    // Remove forwarded LoadStaticProperty instructions (descending per block).
    for (const [block, indices] of toRemove) {
      indices.sort((a, b) => b - a);
      for (const index of indices) {
        block.removeInstructionAt(index);
      }
    }

    // Rewrite all uses of forwarded loads to the property values.
    for (const block of this.functionIR.blocks.values()) {
      block.rewriteAll(rewrites);
    }

    for (const phi of this.functionIR.phis) {
      for (const [blockId, place] of phi.operands) {
        const rewritten = rewrites.get(place.identifier);
        if (rewritten) {
          phi.operands.set(blockId, rewritten);
        }
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Dead property load elimination
  // ---------------------------------------------------------------------------

  /**
   * Removes unused property loads on non-escaping object literals.
   *
   * A `LoadStaticProperty` / `LoadDynamicProperty` on an object that is:
   *   1. Defined by an `ObjectExpressionInstruction` (no getters), AND
   *   2. `NoEscape` (no external code could have installed a getter)
   *
   * is guaranteed side-effect-free. If its result is unused, the load
   * can be safely removed.
   */
  private stepDeadPropertyLoadElimination(): boolean {
    const escapeResult = this.AM.get(EscapeAnalysis, this.functionIR);
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        if (
          !(instr instanceof LoadStaticPropertyInstruction) &&
          !(instr instanceof LoadDynamicPropertyInstruction)
        ) {
          continue;
        }

        // Result must be unused.
        if (instr.place.identifier.uses.size > 0) continue;

        // Object must be a NoEscape literal.
        const objExpr = this.resolveToObjectExpression(instr.object);
        if (!objExpr) continue;
        if (!escapeResult.doesNotEscape(objExpr.place.identifier.id)) continue;

        let indices = toRemove.get(block);
        if (!indices) {
          indices = [];
          toRemove.set(block, indices);
        }
        indices.push(i);
      }
    }

    if (toRemove.size === 0) return false;

    for (const [block, indices] of toRemove) {
      indices.sort((a, b) => b - a);
      for (const index of indices) {
        block.removeInstructionAt(index);
      }
    }

    return true;
  }

  /**
   * Returns true if the instruction's result is used as the argument
   * to a `delete` UnaryExpression.
   */
  private feedsDeleteExpression(instr: LoadStaticPropertyInstruction): boolean {
    for (const user of instr.place.identifier.uses) {
      if (user instanceof UnaryExpressionInstruction && user.operator === "delete") {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolve a place to the IdentifierId of its defining ObjectExpression,
   * or null if it doesn't trace back to one.
   */
  private resolveToObjectId(place: Place): IdentifierId | null {
    const objExpr = this.resolveToObjectExpression(place);
    return objExpr ? objExpr.place.identifier.id : null;
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private findObjectPattern(
    block: BasicBlock,
    storeIndex: number,
    lval: Place,
  ): ObjectPatternInstruction | null {
    const targetId = lval.identifier.id;
    for (let j = storeIndex - 1; j >= 0; j--) {
      const prev = block.instructions[j];
      if (prev instanceof ObjectPatternInstruction && prev.place.identifier.id === targetId) {
        return prev;
      }
    }
    return null;
  }

  /**
   * Build a map from property key (as string) → value {@link Place} for
   * every property in an object literal.
   *
   * Returns `null` if any property is a spread element, has a computed
   * key, or has a non-literal key.
   */
  private buildObjectKeyToValue(
    objectExpr: ObjectExpressionInstruction,
  ): Map<string, Place> | null {
    const map = new Map<string, Place>();

    for (const propPlace of objectExpr.properties) {
      const prop = propPlace.identifier.definer;

      if (prop instanceof SpreadElementInstruction) return null;
      if (!(prop instanceof ObjectPropertyInstruction)) return null;

      if (prop.computed) return null;

      const keyDefiner = prop.key.identifier.definer;
      if (!(keyDefiner instanceof LiteralInstruction)) return null;
      if (typeof keyDefiner.value !== "string" && typeof keyDefiner.value !== "number") return null;

      map.set(String(keyDefiner.value), prop.value);
    }

    return map;
  }

  private matchPatternToObject(
    pattern: ObjectPatternInstruction,
    objMap: Map<string, Place>,
  ): Array<{ lval: Place; value: Place }> | null {
    const replacements: Array<{ lval: Place; value: Place }> = [];

    for (const propPlace of pattern.properties) {
      const prop = propPlace.identifier.definer;

      if (prop instanceof RestElementInstruction) return null;
      if (!(prop instanceof ObjectPropertyInstruction)) return null;

      if (prop.computed) return null;

      if (prop.value.identifier.definer instanceof AssignmentPatternInstruction) return null;

      const keyDefiner = prop.key.identifier.definer;
      if (!(keyDefiner instanceof LiteralInstruction)) return null;
      if (typeof keyDefiner.value !== "string" && typeof keyDefiner.value !== "number") return null;

      const keyName = String(keyDefiner.value);

      const objValue = objMap.get(keyName);
      if (objValue === undefined) return null;

      replacements.push({ lval: prop.value, value: objValue });
    }

    return replacements;
  }

  private matchDestructureToObject(
    pattern: ObjectDestructureInstruction,
    objMap: Map<string, Place>,
  ): Array<{ lval: Place; value: Place }> | null {
    const replacements: Array<{ lval: Place; value: Place }> = [];

    for (const property of pattern.properties) {
      if (property.value.kind === "rest") return null;
      if (property.value.kind === "assignment") return null;
      if (property.computed || typeof property.key !== "string") return null;
      if (property.value.kind !== "binding" || property.value.storage !== "local") return null;

      const objValue = objMap.get(property.key);
      if (objValue === undefined) return null;
      replacements.push({ lval: property.value.place, value: objValue });
    }

    return replacements;
  }
}
