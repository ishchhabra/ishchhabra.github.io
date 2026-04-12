import {
  BaseInstruction,
  DeclareLocalInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadGlobalInstruction,
  LoadLocalInstruction,
  MetaPropertyInstruction,
  RegExpLiteralInstruction,
  StoreLocalInstruction,
  ThisExpressionInstruction,
  ValueInstruction,
} from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { MemoryInstruction } from "../../ir/base";
import { LoadPhiInstruction } from "../../ir/instructions/memory/LoadPhi";

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

  public run(): { blocks: FunctionIR["blocks"] } {
    const environment = this.moduleIR.environment;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = 0; i < block.instructions.length; i++) {
        const instruction = block.instructions[i];

        if (!this.needsMaterialization(instruction)) {
          continue;
        }

        // Create: const $tmp = <value>
        const lval = environment.createPlace(environment.createIdentifier());
        const store = environment.createInstruction(
          StoreLocalInstruction,
          environment.createPlace(environment.createIdentifier()),
          lval,
          instruction.place,
          "const",
          "declaration",
        );

        // Insert the StoreLocal immediately after the defining instruction.
        block.insertInstructionAt(i + 1, store);
        environment.placeToInstruction.set(store.place.id, store);

        // Rewrite all users to reference the StoreLocal's lval.
        this.rewriteUses(instruction, store.lval);

        // Skip past the inserted StoreLocal.
        i++;
      }
    }

    return { blocks: this.functionIR.blocks };
  }

  /**
   * Returns true if the instruction's output Place has multiple uses
   * and codegen would duplicate the expression without a variable.
   */
  private needsMaterialization(instruction: BaseInstruction): boolean {
    if (instruction.place.identifier.uses.size <= 1) {
      return false;
    }

    // StoreLocal/destructure instructions already emit declarations.
    if (instruction instanceof StoreLocalInstruction) {
      return false;
    }

    // Trivially duplicable: codegen emits a single token (literal,
    // variable name, `this`, `import.meta`). Safe to share the AST
    // node — duplicating these is both correct and cheap.
    if (this.isTriviallyDuplicable(instruction)) {
      return false;
    }

    // Value instructions (calls, binary ops, await, etc.) produce
    // expressions that must not be duplicated.
    if (instruction instanceof ValueInstruction) {
      return true;
    }

    // Load-type memory instructions (LoadStaticProperty, etc.) that
    // aren't trivially duplicable and don't already have a StoreLocal.
    if (instruction instanceof MemoryInstruction) {
      return !this.hasStoreLocal(instruction);
    }

    return false;
  }

  /**
   * Returns true if the instruction produces a trivially duplicable
   * value — one that codegen can safely emit multiple times because
   * it's a single token with no side effects.
   */
  private isTriviallyDuplicable(instruction: BaseInstruction): boolean {
    if (
      instruction instanceof LiteralInstruction ||
      instruction instanceof LoadGlobalInstruction ||
      instruction instanceof LoadContextInstruction ||
      instruction instanceof ThisExpressionInstruction ||
      instruction instanceof MetaPropertyInstruction ||
      instruction instanceof RegExpLiteralInstruction
    ) {
      return true;
    }

    // LoadLocal/LoadPhi are trivially duplicable when the loaded value
    // is a declared variable (StoreLocal, DeclareLocal, parameter, or
    // capture — all of which codegen emits as a named identifier).
    // If the source is a bare SSA temp from a ValueInstruction, codegen
    // would chase the def chain and emit the full expression inline.
    if (instruction instanceof LoadLocalInstruction || instruction instanceof LoadPhiInstruction) {
      const source = instruction.value.identifier.definer;
      // No definer → parameter or capture (always named).
      // StoreLocal/DeclareLocal → declared variable (always named).
      // Anything else (ValueInstruction output) → SSA temp, not safe.
      return (
        source === undefined ||
        source instanceof StoreLocalInstruction ||
        source instanceof DeclareLocalInstruction
      );
    }

    return false;
  }

  /**
   * Checks whether a StoreLocal already exists that stores this
   * instruction's output, making materialization unnecessary.
   */
  private hasStoreLocal(instruction: BaseInstruction): boolean {
    for (const user of instruction.place.identifier.uses) {
      if (user instanceof StoreLocalInstruction && user.value === instruction.place) {
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
  private rewriteUses(instruction: BaseInstruction, newPlace: typeof instruction.place): void {
    const oldIdentifier = instruction.place.identifier;
    const users = [...oldIdentifier.uses];

    for (const user of users) {
      // Don't rewrite the StoreLocal we just created — it needs to
      // reference the original value as its RHS.
      if (user instanceof StoreLocalInstruction && user.value === instruction.place) {
        continue;
      }

      if (user instanceof BaseInstruction) {
        this.rewriteInstructionUser(user, oldIdentifier, newPlace);
      }
    }

    // Rewrite terminal references.
    for (const block of this.functionIR.blocks.values()) {
      if (block.terminal) {
        const operands = block.terminal.getOperands();
        if (operands.some((op) => op.identifier === oldIdentifier)) {
          const map = new Map([[oldIdentifier, newPlace]]);
          block.replaceTerminal(block.terminal.rewrite(map));
        }
      }
    }

    // Rewrite structure references.
    for (const [blockId, structure] of this.functionIR.structures) {
      const operands = structure.getOperands();
      if (operands.some((op) => op.identifier === oldIdentifier)) {
        const map = new Map([[oldIdentifier, newPlace]]);
        const rewritten = structure.rewrite(map);
        if (rewritten !== structure) {
          this.functionIR.setStructure(blockId, rewritten);
        }
      }
    }
  }

  private rewriteInstructionUser(
    user: BaseInstruction,
    oldIdentifier: typeof user.place.identifier,
    newPlace: typeof user.place,
  ): void {
    for (const block of this.functionIR.blocks.values()) {
      const index = block.instructions.indexOf(user);
      if (index === -1) continue;

      const map = new Map([[oldIdentifier, newPlace]]);
      const rewritten = user.rewrite(map);
      if (rewritten !== user) {
        block.replaceInstruction(index, rewritten);
        this.moduleIR.environment.placeToInstruction.set(rewritten.place.id, rewritten);
      }
      return;
    }
  }
}
