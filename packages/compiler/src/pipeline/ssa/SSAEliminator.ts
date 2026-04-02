import {
  BasicBlock,
  BlockId,
  CopyInstruction,
  DeclareLocalInstruction,
  ExpressionStatementInstruction,
  LiteralInstruction,
  LoadLocalInstruction,
  makeInstructionId,
  StoreLocalInstruction,
} from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Phi } from "./Phi";

interface SSAEliminationResult {
  blocks: Map<BlockId, BasicBlock>;
}

/**
 * Eliminates the phis from the HIR by inserting copy instructions.
 */
export class SSAEliminator {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): SSAEliminationResult {
    for (const phi of this.functionIR.phis) {
      // Single-operand phis are redundant but must still be declared —
      // SSA renaming already inserted references to them. When the
      // optimizer is enabled, ConstantPropagation degrades these before
      // elimination. Without the optimizer, we emit the declaration and
      // copy; the late optimizer can clean up the redundancy.
      if (phi.operands.size === 0) {
        continue;
      }

      this.#insertPhiDeclaration(phi);
      this.#insertPhiCopies(phi);
    }

    return { blocks: this.functionIR.blocks };
  }

  #insertPhiDeclaration(phi: Phi) {
    const declaration = this.moduleIR.environment.declToPlaces.get(phi.declarationId)?.[0];
    if (declaration === undefined) {
      throw new Error(`Declaration place not found for ${phi.declarationId}`);
    }

    const declarationBlock = this.functionIR.getBlock(declaration.blockId);

    const bindingInstr = this.moduleIR.environment.createInstruction(
      DeclareLocalInstruction,
      phi.place,
      undefined,
      "let",
    );
    declarationBlock.appendInstruction(bindingInstr);
    this.moduleIR.environment.placeToInstruction.set(phi.place.id, bindingInstr);

    const undefinedId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const undefinedPlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(),
    );
    const undefinedInstr = new LiteralInstruction(
      undefinedId,
      undefinedPlace,
      undefined,
      undefined,
    );
    declarationBlock.appendInstruction(undefinedInstr);
    this.moduleIR.environment.placeToInstruction.set(undefinedPlace.id, undefinedInstr);

    const identifier = this.moduleIR.environment.createIdentifier(
      phi.place.identifier.declarationId,
    );
    const place = this.moduleIR.environment.createPlace(identifier);

    const instructionId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const instruction = new StoreLocalInstruction(
      instructionId,
      place,
      undefined,
      phi.place,
      undefinedPlace,
      "let",
    );

    declarationBlock.appendInstruction(instruction);
    this.moduleIR.environment.placeToInstruction.set(place.id, instruction);
  }

  #insertPhiCopies(phi: Phi) {
    for (const [blockId, place] of phi.operands) {
      const block = this.functionIR.getBlock(blockId);

      // Step 1: Load the value of the variable into a place.
      const loadId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const loadPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(),
      );
      const loadInstr = new LoadLocalInstruction(loadId, loadPlace, undefined, place);
      block.appendInstruction(loadInstr);
      this.moduleIR.environment.placeToInstruction.set(loadPlace.id, loadInstr);

      // Step 2: Create a copy instruction using the loaded value.
      const copyId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const copyPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
      );
      const copyInstr = new CopyInstruction(copyId, copyPlace, undefined, phi.place, loadPlace);
      block.appendInstruction(copyInstr);
      this.moduleIR.environment.placeToInstruction.set(copyPlace.id, copyInstr);

      // Step 3: Wrap the copy instruction in an expression statement.
      const exprId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const exprPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(),
      );
      const exprInstr = new ExpressionStatementInstruction(exprId, exprPlace, undefined, copyPlace);
      block.appendInstruction(exprInstr);
      this.moduleIR.environment.placeToInstruction.set(exprPlace.id, exprInstr);
    }
  }
}
