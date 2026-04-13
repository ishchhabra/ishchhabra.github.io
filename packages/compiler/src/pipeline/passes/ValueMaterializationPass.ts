import {
  Operation,
  DeclareLocalOp,
  LiteralOp,
  LoadContextOp,
  LoadGlobalOp,
  LoadLocalOp,
  MetaPropertyOp,
  RegExpLiteralOp,
  StoreLocalOp,
  ThisExpressionOp,
} from "../../ir";
import { isMemoryOp, isValueOp } from "../../ir/categories";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { Identifier } from "../../ir/core/Identifier";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { LoadPhiOp } from "../../ir/ops/mem/LoadPhi";

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
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public run(): void {
    const environment = this.moduleIR.environment;

    for (const block of this.functionIR.allBlocks()) {
      for (let i = 0; i < block.operations.length; i++) {
        const instruction = block.operations[i];

        if (!this.needsMaterialization(instruction)) {
          continue;
        }

        // Create: const $tmp = <value>
        const lval = environment.createPlace(environment.createIdentifier());
        const store = environment.createOperation(
          StoreLocalOp,
          environment.createPlace(environment.createIdentifier()),
          lval,
          instruction.place!,
          "const",
          "declaration",
        );

        // Insert the StoreLocal immediately after the defining instruction.
        block.insertOpAt(i + 1, store);
        environment.placeToOp.set(store.place.id, store);

        // Rewrite all users to reference the StoreLocal's lval.
        this.rewriteUses(instruction, store.lval);

        // Skip past the inserted StoreLocal.
        i++;
      }
    }
  }

  /**
   * Returns true if the instruction's output Place has multiple uses
   * and codegen would duplicate the expression without a variable.
   */
  private needsMaterialization(instruction: Operation): boolean {
    if (instruction.place!.identifier.uses.size <= 1) {
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

    // LoadLocal/LoadPhi are trivially duplicable when the loaded value
    // is a declared variable (StoreLocal, DeclareLocal, parameter, or
    // capture — all of which codegen emits as a named identifier).
    // If the source is a bare SSA temp from a ValueInstruction, codegen
    // would chase the def chain and emit the full expression inline.
    if (instruction instanceof LoadLocalOp || instruction instanceof LoadPhiOp) {
      const source = instruction.value.identifier.definer;
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
    for (const user of instruction.place!.identifier.uses) {
      if (user instanceof StoreLocalOp && user.value === instruction.place) {
        return true;
      }
    }
    return false;
  }

  /**
   * Rewrites all users of `instruction.place` to use `newPlace` instead,
   * except for the StoreLocal we just inserted (which references the
   * original place as its value).
   */
  private rewriteUses(instruction: Operation, newPlace: Place): void {
    const oldIdentifier = instruction.place!.identifier;
    const users = [...oldIdentifier.uses];

    for (const user of users) {
      // Don't rewrite the StoreLocal we just created — it needs to
      // reference the original value as its RHS.
      if (user instanceof StoreLocalOp && user.value === instruction.place) {
        continue;
      }

      if (user instanceof Operation) {
        this.rewriteInstructionUser(user, oldIdentifier, newPlace);
      }
    }

    // Rewrite terminal references.
    for (const block of this.functionIR.allBlocks()) {
      if (block.terminal) {
        const operands = block.terminal.getOperands();
        if (operands.some((op) => op.identifier === oldIdentifier)) {
          const map = new Map<Identifier, Place>([[oldIdentifier, newPlace]]);
          block.replaceTerminal(
            block.terminal.rewrite(map) as import("../../ir/ops/control").Terminal,
          );
        }
      }
    }

    // Rewrite structure references.
    for (const [blockId, structure] of this.functionIR.structures) {
      const operands = structure.getOperands();
      if (operands.some((op) => op.identifier === oldIdentifier)) {
        const map = new Map<Identifier, Place>([[oldIdentifier, newPlace]]);
        const rewritten = structure.rewrite(map);
        if (rewritten !== structure) {
          this.functionIR.setStructure(
            blockId,
            rewritten as import("../../ir/ops/control").Structure,
          );
        }
      }
    }
  }

  private rewriteInstructionUser(
    user: Operation,
    oldIdentifier: Identifier,
    newPlace: Place,
  ): void {
    for (const block of this.functionIR.allBlocks()) {
      const index = block.operations.indexOf(user);
      if (index === -1) continue;

      const map = new Map<Identifier, Place>([[oldIdentifier, newPlace]]);
      const rewritten = user.rewrite(map);
      if (rewritten !== user) {
        block.replaceOp(index, rewritten);
        this.moduleIR.environment.placeToOp.set(rewritten.place!.id, rewritten);
      }
      return;
    }
  }
}
