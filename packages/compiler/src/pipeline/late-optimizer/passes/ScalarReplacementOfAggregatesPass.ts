import { Environment } from "../../../environment";
import {
  BasicBlock,
  Value,
  ValueId,
  LiteralOp,
  LoadDynamicPropertyOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  ObjectDestructureOp,
  ObjectExpressionOp,
  ObjectPropertyOp,
  StoreLocalOp,
  UnaryExpressionOp,
  makeOperationId,
} from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { SpreadElementOp } from "../../../ir/ops/prim/SpreadElement";
import { StoreDynamicPropertyOp } from "../../../ir/ops/prop/StoreDynamicProperty";
import { StoreStaticPropertyOp } from "../../../ir/ops/prop/StoreStaticProperty";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import { EscapeAnalysis } from "../../analysis/EscapeAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

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
 *   1. The RHS is a syntactic `ObjectExpressionOp` — a literal
 *      `{ ... }` that is guaranteed free of getters and Proxy traps.
 *   2. The object contains no spread elements (`SpreadElementOp`).
 *   3. Every property in both the object and the pattern has a
 *      non-computed, literal key.
 *   4. The pattern contains no rest elements.
 *   5. The pattern contains no default values.
 *   6. Every pattern key has a corresponding key in the object literal
 *      (no implicit `undefined` bindings).
 *
 * **Soundness conditions** for member-access SROA:
 *
 *   1. The object is a syntactic `ObjectExpressionOp`.
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
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
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

    for (const block of this.funcOp.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];
        let valuePlace: Value;
        let storeKind: StoreLocalOp["kind"];
        let declarationKind: StoreLocalOp["type"];
        let pattern: ObjectDestructureOp | null = null;

        if (instr instanceof ObjectDestructureOp) {
          valuePlace = instr.value;
          storeKind = instr.kind;
          declarationKind = instr.declarationKind ?? "const";
          pattern = instr;
        } else {
          continue;
        }

        if (!pattern) continue;

        const objectExpr = valuePlace.definer;
        if (!(objectExpr instanceof ObjectExpressionOp)) continue;

        const objMap = this.buildObjectKeyToValue(objectExpr);
        if (!objMap) continue;

        const replacements = this.matchDestructureToObject(pattern, objMap);
        if (!replacements) continue;

        block.removeOpAt(i);

        for (let j = 0; j < replacements.length; j++) {
          const { lval, value } = replacements[j];
          const id = makeOperationId(this.environment.nextOperationId++);
          const place = this.environment.createValue();
          const scalar = new StoreLocalOp(id, place, lval, value, declarationKind, storeKind);
          block.insertOpAt(i + j, scalar);
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
    const escapeResult = this.AM.get(EscapeAnalysis, this.funcOp);

    // 1. Find non-escaping, unmodified object literals.
    const candidates = new Map<
      ValueId,
      { objExpr: ObjectExpressionOp; propMap: Map<string, Value> }
    >();

    for (const block of this.funcOp.allBlocks()) {
      for (const instr of block.operations) {
        if (!(instr instanceof ObjectExpressionOp)) continue;
        if (!escapeResult.doesNotEscape(instr.place.id)) continue;

        const propMap = this.buildObjectKeyToValue(instr);
        if (!propMap) continue;

        candidates.set(instr.place.id, { objExpr: instr, propMap });
      }
    }

    if (candidates.size === 0) return false;

    // Remove candidates that have property writes.
    this.removeModifiedObjects(candidates);
    if (candidates.size === 0) return false;

    // 2. Build a rewrite map: LoadStaticProperty result → property value.
    //    Also collect the LoadStaticProperty instructions to remove.
    const rewrites = new Map<Value, Value>();
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.funcOp.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];
        if (!(instr instanceof LoadStaticPropertyOp)) continue;

        const objExpr = this.resolveToObjectExpression(instr.object);
        if (!objExpr) continue;

        const candidate = candidates.get(objExpr.place.id);
        if (!candidate) continue;

        const value = candidate.propMap.get(instr.property);
        if (value === undefined) continue;

        rewrites.set(instr.place, value);

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
        block.removeOpAt(index);
      }
    }

    // 4. Rewrite all uses of the removed loads to point to the property
    //    values. `block.rewriteAll` walks terminators too — including
    //    their block-args edge operands — so no separate merge-value
    //    fixup is needed.
    for (const block of this.funcOp.allBlocks()) {
      for (const op of [...block.getAllOps()]) {
        const rewritten = op.rewrite(rewrites);
        if (rewritten !== op) block.replaceOp(op, rewritten);
      }
    }
    return true;
  }

  /**
   * Trace an identifier through value-forwarding instructions
   * (LoadLocal, StoreLocal) back to its origin. Returns the
   * ObjectExpressionOp if found, null otherwise.
   */
  private resolveToObjectExpression(place: Value): ObjectExpressionOp | null {
    // oxlint-disable-next-line typescript/no-explicit-any
    let current: any = place.definer;
    for (let depth = 0; depth < 10 && current; depth++) {
      if (current instanceof ObjectExpressionOp) return current;
      if (current instanceof LoadLocalOp) {
        current = current.value.definer;
      } else if (current instanceof StoreLocalOp) {
        current = current.value.definer;
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
    candidates: Map<ValueId, { objExpr: ObjectExpressionOp; propMap: Map<string, Value> }>,
  ): void {
    for (const block of this.funcOp.allBlocks()) {
      for (const instr of block.operations) {
        // Direct property stores.
        if (instr instanceof StoreStaticPropertyOp || instr instanceof StoreDynamicPropertyOp) {
          const objExpr = this.resolveToObjectExpression(instr.object);
          if (objExpr) {
            candidates.delete(objExpr.place.id);
          }
        }

        // `delete obj.prop` — the delete argument is a LoadStaticProperty.
        if (instr instanceof UnaryExpressionOp && instr.operator === "delete") {
          const argDefiner = instr.argument.definer;
          if (argDefiner instanceof LoadStaticPropertyOp) {
            const objExpr = this.resolveToObjectExpression(argDefiner.object);
            if (objExpr) {
              candidates.delete(objExpr.place.id);
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
    const escapeResult = this.AM.get(EscapeAnalysis, this.funcOp);
    const rewrites = new Map<Value, Value>();
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.funcOp.allBlocks()) {
      // Virtual state: objectId → (propertyKey → current value Value)
      const virtualState = new Map<ValueId, Map<string, Value>>();

      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];

        // Initialize virtual state when we see a non-escaping object literal.
        if (instr instanceof ObjectExpressionOp) {
          if (!escapeResult.doesNotEscape(instr.place.id)) continue;
          const propMap = this.buildObjectKeyToValue(instr);
          if (propMap) {
            virtualState.set(instr.place.id, new Map(propMap));
          }
          continue;
        }

        // Static property store → update the tracked value.
        if (instr instanceof StoreStaticPropertyOp) {
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
        if (instr instanceof StoreDynamicPropertyOp) {
          const objId = this.resolveToObjectId(instr.object);
          if (objId !== null) {
            virtualState.delete(objId);
          }
          continue;
        }

        // `delete obj.prop` → invalidate the specific property.
        if (instr instanceof UnaryExpressionOp && instr.operator === "delete") {
          const argDefiner = instr.argument.definer;
          if (argDefiner instanceof LoadStaticPropertyOp) {
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
        if (instr instanceof LoadStaticPropertyOp) {
          const objId = this.resolveToObjectId(instr.object);
          if (objId === null) continue;
          const state = virtualState.get(objId);
          if (!state) continue;
          const value = state.get(instr.property);
          if (value === undefined) continue;

          // Don't forward if the load feeds a `delete` expression —
          // `delete` needs the actual property reference, not the value.
          if (this.feedsDeleteExpression(instr)) continue;

          rewrites.set(instr.place, value);

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
        block.removeOpAt(index);
      }
    }

    // Rewrite all uses of forwarded loads to the property values.
    // `block.rewriteAll` walks terminators too, so the block-args
    // edge operands are rewritten in the same sweep; we just rebuild
    // phis from the updated block args afterward.
    for (const block of this.funcOp.allBlocks()) {
      for (const op of [...block.getAllOps()]) {
        const rewritten = op.rewrite(rewrites);
        if (rewritten !== op) block.replaceOp(op, rewritten);
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
   *   1. Defined by an `ObjectExpressionOp` (no getters), AND
   *   2. `NoEscape` (no external code could have installed a getter)
   *
   * is guaranteed side-effect-free. If its result is unused, the load
   * can be safely removed.
   */
  private stepDeadPropertyLoadElimination(): boolean {
    const escapeResult = this.AM.get(EscapeAnalysis, this.funcOp);
    const toRemove = new Map<BasicBlock, number[]>();

    for (const block of this.funcOp.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];

        if (!(instr instanceof LoadStaticPropertyOp) && !(instr instanceof LoadDynamicPropertyOp)) {
          continue;
        }

        // Result must be unused.
        if (instr.place.uses.size > 0) continue;

        // Object must be a NoEscape literal.
        const objExpr = this.resolveToObjectExpression(instr.object);
        if (!objExpr) continue;
        if (!escapeResult.doesNotEscape(objExpr.place.id)) continue;

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
        block.removeOpAt(index);
      }
    }

    return true;
  }

  /**
   * Returns true if the instruction's result is used as the argument
   * to a `delete` UnaryExpression.
   */
  private feedsDeleteExpression(instr: LoadStaticPropertyOp): boolean {
    for (const user of instr.place.uses) {
      if (user instanceof UnaryExpressionOp && user.operator === "delete") {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolve a place to the ValueId of its defining ObjectExpression,
   * or null if it doesn't trace back to one.
   */
  private resolveToObjectId(place: Value): ValueId | null {
    const objExpr = this.resolveToObjectExpression(place);
    return objExpr ? objExpr.place.id : null;
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a map from property key (as string) → value {@link Value} for
   * every property in an object literal.
   *
   * Returns `null` if any property is a spread element, has a computed
   * key, or has a non-literal key.
   */
  private buildObjectKeyToValue(objectExpr: ObjectExpressionOp): Map<string, Value> | null {
    const map = new Map<string, Value>();

    for (const propPlace of objectExpr.properties) {
      const prop = propPlace.definer;

      if (prop instanceof SpreadElementOp) return null;
      if (!(prop instanceof ObjectPropertyOp)) return null;

      if (prop.computed) return null;

      const keyDefiner = prop.key.definer;
      if (!(keyDefiner instanceof LiteralOp)) return null;
      if (typeof keyDefiner.value !== "string" && typeof keyDefiner.value !== "number") return null;

      map.set(String(keyDefiner.value), prop.value);
    }

    return map;
  }

  private matchDestructureToObject(
    pattern: ObjectDestructureOp,
    objMap: Map<string, Value>,
  ): Array<{ lval: Value; value: Value }> | null {
    const replacements: Array<{ lval: Value; value: Value }> = [];

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
