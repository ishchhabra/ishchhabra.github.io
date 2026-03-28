import { Environment } from "../../../environment";
import {
  BasicBlock,
  LiteralInstruction,
  ObjectExpressionInstruction,
  ObjectPatternInstruction,
  ObjectPropertyInstruction,
  RestElementInstruction,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { Place } from "../../../ir/core/Place";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { AssignmentPatternInstruction } from "../../../ir/instructions/pattern/AssignmentPattern";
import { SpreadElementInstruction } from "../../../ir/instructions/SpreadElement";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Scalar Replacement of Aggregates — decomposes destructuring assignments
 * of object literals into individual scalar variable declarations.
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
 * **Soundness conditions.** The transformation is applied only when:
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
 * Under these constraints the observable behavior is identical: each
 * binding receives the same value it would have received through the
 * destructuring, and evaluation order of property-value expressions is
 * preserved because they were already computed before the `StoreLocal`.
 *
 * Pattern and object instructions that become dead after replacement are
 * left for {@link LateDeadCodeEliminationPass} to clean up.
 */
export class ScalarReplacementOfAggregatesPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];
        if (!(instr instanceof StoreLocalInstruction)) continue;
        if (instr.bindings.length === 0) continue;

        // StoreLocal writes to lval, overriding its definer. Search
        // backward for the ObjectPatternInstruction that originally
        // defined the lval identifier.
        const pattern = this.findObjectPattern(block, i, instr.lval);
        if (!pattern) continue;

        // The value's definer is intact (StoreLocal only reads it).
        const objectExpr = instr.value.identifier.definer;
        if (!(objectExpr instanceof ObjectExpressionInstruction)) continue;

        // Build key → value map from the object literal.
        const objMap = this.buildObjectKeyToValue(objectExpr);
        if (!objMap) continue;

        // Match every pattern property to an object property.
        const replacements = this.matchPatternToObject(pattern, objMap);
        if (!replacements) continue;

        // --- Perform the scalar replacement ---

        // Remove the original destructuring StoreLocal.
        block.removeInstructionAt(i);

        // Insert individual StoreLocals for each binding.
        for (let j = 0; j < replacements.length; j++) {
          const { lval, value } = replacements[j];
          const id = makeInstructionId(this.environment.nextInstructionId++);
          const identifier = this.environment.createIdentifier();
          const place = this.environment.createPlace(identifier);
          const scalar = new StoreLocalInstruction(id, place, undefined, lval, value, instr.type);
          block.insertInstructionAt(i + j, scalar);
        }

        // Advance past the newly inserted instructions.
        i += replacements.length - 1;
        changed = true;
      }
    }

    return { changed };
  }

  /**
   * Search backward from `storeIndex` for an {@link ObjectPatternInstruction}
   * whose place identifier matches the given `lval`.
   *
   * This is necessary because `StoreLocal` lists `lval` in its written
   * places, overriding the definer that was originally set by the pattern
   * instruction.
   */
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

      // Spread elements → bail.
      if (prop instanceof SpreadElementInstruction) return null;
      if (!(prop instanceof ObjectPropertyInstruction)) return null;

      // Computed keys → bail.
      if (prop.computed) return null;

      // Key must be a literal.
      const keyDefiner = prop.key.identifier.definer;
      if (!(keyDefiner instanceof LiteralInstruction)) return null;
      if (typeof keyDefiner.value !== "string" && typeof keyDefiner.value !== "number") return null;

      // Duplicate keys: last one wins (matches JS semantics).
      map.set(String(keyDefiner.value), prop.value);
    }

    return map;
  }

  /**
   * Match each property in the destructuring pattern to a key in the
   * object literal.
   *
   * Returns an ordered array of `{ lval, value }` pairs for each scalar
   * binding, or `null` if the pattern cannot be safely decomposed.
   */
  private matchPatternToObject(
    pattern: ObjectPatternInstruction,
    objMap: Map<string, Place>,
  ): Array<{ lval: Place; value: Place }> | null {
    const replacements: Array<{ lval: Place; value: Place }> = [];

    for (const propPlace of pattern.properties) {
      const prop = propPlace.identifier.definer;

      // Rest elements → bail.
      if (prop instanceof RestElementInstruction) return null;
      if (!(prop instanceof ObjectPropertyInstruction)) return null;

      // Computed keys → bail.
      if (prop.computed) return null;

      // Default values → bail.
      if (prop.value.identifier.definer instanceof AssignmentPatternInstruction) return null;

      // Key must be a literal.
      const keyDefiner = prop.key.identifier.definer;
      if (!(keyDefiner instanceof LiteralInstruction)) return null;
      if (typeof keyDefiner.value !== "string" && typeof keyDefiner.value !== "number") return null;

      const keyName = String(keyDefiner.value);

      // The object must have this property.
      const objValue = objMap.get(keyName);
      if (objValue === undefined) return null;

      // prop.value is the binding target (BindingIdentifier place).
      replacements.push({ lval: prop.value, value: objValue });
    }

    return replacements;
  }
}
