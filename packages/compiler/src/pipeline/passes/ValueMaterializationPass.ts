import {
  DeclareLocalOp,
  LiteralOp,
  LoadContextOp,
  LoadGlobalOp,
  LoadLocalOp,
  MetaPropertyOp,
  Operation,
  RegExpLiteralOp,
  StoreLocalOp,
  ThisExpressionOp,
} from "../../ir";
import { isMemoryOp, isValueOp } from "../../ir/categories";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { ModuleIR } from "../../ir/core/ModuleIR";

/**
 * Lowering pass: materializes multi-use SSA values into StoreLocal
 * declarations so codegen can reference them by name.
 *
 * In the optimizer, every value is defined once and used N times
 * without concern for how codegen emits it. This pass bridges that
 * gap: any value used more than once that isn't already stored in a
 * variable gets a `const` declaration inserted.
 *
 * Analogous to register allocation in a hardware compiler — values
 * with one use stay "in register" (inlined by codegen), values with
 * multiple uses get "spilled" to a named variable.
 *
 * Runs once after the late optimizer, before codegen. No fixpoint.
 */
export class ValueMaterializationPass {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public run(): void {
    const environment = this.moduleIR.environment;

    for (const block of this.funcOp.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instruction = block.operations[i];

        if (!this.needsMaterialization(instruction)) {
          continue;
        }

        // Create: const $tmp = <value>
        const lval = environment.createValue();
        const store = environment.createOperation(
          StoreLocalOp,
          environment.createValue(),
          lval,
          instruction.place!,
          "const",
          "declaration",
        );

        // Insert the StoreLocal immediately after the defining instruction.
        block.insertOpAt(i + 1, store);

        // Rewrite all users to reference the StoreLocal's lval.
        this.rewriteUses(instruction, store.lval, store);

        // Skip past the inserted StoreLocal.
        i++;
      }
    }
  }

  /**
   * Returns true if the instruction's output Value has multiple uses
   * and codegen would duplicate the expression without a variable.
   */
  private needsMaterialization(instruction: Operation): boolean {
    if (instruction.place === undefined) {
      return false;
    }
    if (instruction.place.uses.size <= 1) {
      return false;
    }

    // StoreLocal/destructure instructions already emit declarations.
    if (instruction instanceof StoreLocalOp) {
      return false;
    }

    // Trivially duplicable: codegen emits a single token (literal,
    // variable name, `this`, `import.meta`). Safe to share the AST
    // node — duplicating these is both correct and cheap.
    if (this.isTriviallyDuplicable(instruction)) {
      return false;
    }

    // Value ops (calls, binary ops, await, etc.) produce expressions
    // that must not be duplicated.
    if (isValueOp(instruction)) {
      return true;
    }

    // Load-type memory ops (LoadStaticProperty, etc.) that aren't
    // trivially duplicable and don't already have a StoreLocal.
    if (isMemoryOp(instruction)) {
      return !this.hasStoreLocal(instruction);
    }

    return false;
  }

  /**
   * Returns true if the instruction produces a trivially duplicable
   * value — one that codegen can safely emit multiple times because
   * it's a single token with no side effects.
   */
  private isTriviallyDuplicable(instruction: Operation): boolean {
    if (
      instruction instanceof LiteralOp ||
      instruction instanceof LoadGlobalOp ||
      instruction instanceof LoadContextOp ||
      instruction instanceof ThisExpressionOp ||
      instruction instanceof MetaPropertyOp ||
      instruction instanceof RegExpLiteralOp
    ) {
      return true;
    }

    // LoadLocal is trivially duplicable when the loaded value is a
    // declared variable (StoreLocal, DeclareLocal, parameter, or
    // capture — all of which codegen emits as a named identifier).
    // If the source is a bare SSA temp from a ValueInstruction, codegen
    // would chase the def chain and emit the full expression inline.
    if (instruction instanceof LoadLocalOp) {
      const source = instruction.value.definer;
      // No definer → parameter or capture (always named).
      // StoreLocal/DeclareLocal → declared variable (always named).
      // Anything else (ValueInstruction output) → SSA temp, not safe.
      return (
        source === undefined || source instanceof StoreLocalOp || source instanceof DeclareLocalOp
      );
    }

    return false;
  }

  /**
   * Checks whether a StoreLocal already exists that stores this
   * instruction's output, making materialization unnecessary.
   */
  private hasStoreLocal(instruction: Operation): boolean {
    for (const user of instruction.place!.uses) {
      if (user instanceof StoreLocalOp && user.value === instruction.place) {
        return true;
      }
    }
    return false;
  }

  /**
   * Rewrite every use of `instruction.place` to use `newPlace`
   * instead, except for `materializedStore` itself — that store's
   * RHS must keep referencing the original value as its source of
   * truth. Skip by identity, not by value-match, because other
   * stores (e.g. SSA copy stores) may also have `instruction.place`
   * as their value and those DO need to be rewritten.
   */
  private rewriteUses(
    instruction: Operation,
    newPlace: Value,
    materializedStore: StoreLocalOp,
  ): void {
    const oldIdentifier = instruction.place!;
    const map = new Map<Value, Value>([[oldIdentifier, newPlace]]);

    for (const block of this.funcOp.allBlocks()) {
      for (const op of block.getAllOps()) {
        if (op === materializedStore) continue;

        const rewritten = op.rewrite(map);
        if (rewritten !== op) {
          block.replaceOp(op, rewritten);
          if (rewritten.place !== undefined) {
          }
        }
      }
    }
  }
}
