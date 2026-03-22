import {
  BasicBlock,
  BindingIdentifierInstruction,
  BlockId,
  CopyInstruction,
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
    private readonly phis: Set<Phi>,
  ) {}

  public eliminate(): SSAEliminationResult {
    for (const phi of this.phis) {
      // Ignore phis with only one operand since they are redundant.
      if (phi.operands.size <= 1) {
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

    const declarationBlock = this.functionIR.blocks.get(declaration.blockId);
    if (declarationBlock === undefined) {
      throw new Error(`Declaration block not found for ${phi.declarationId}`);
    }

    const bindingInstr = this.moduleIR.environment.createInstruction(
      BindingIdentifierInstruction,
      phi.place,
      undefined,
    );
    declarationBlock.instructions.push(bindingInstr);
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
    declarationBlock.instructions.push(undefinedInstr);
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

    declarationBlock.instructions.push(instruction);
    this.moduleIR.environment.placeToInstruction.set(place.id, instruction);
  }

  #insertPhiCopies(phi: Phi) {
    for (const [blockId, place] of phi.operands) {
      const block = this.functionIR.blocks.get(blockId);
      if (block === undefined) {
        throw new Error(`Block not found for ${blockId}`);
      }

      // Step 1: Load the value of the variable into a place.
      const loadId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const loadPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(),
      );
      const loadInstr = new LoadLocalInstruction(loadId, loadPlace, undefined, place);
      block.instructions.push(loadInstr);
      this.moduleIR.environment.placeToInstruction.set(loadPlace.id, loadInstr);

      // Step 2: Create a copy instruction using the loaded value.
      const copyId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const copyPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
      );
      const copyInstr = new CopyInstruction(copyId, copyPlace, undefined, phi.place, loadPlace);
      block.instructions.push(copyInstr);
      this.moduleIR.environment.placeToInstruction.set(copyPlace.id, copyInstr);

      // Step 3: Wrap the copy instruction in an expression statement.
      const exprId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const exprPlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(),
      );
      const exprInstr = new ExpressionStatementInstruction(exprId, exprPlace, undefined, copyPlace);
      block.instructions.push(exprInstr);
      this.moduleIR.environment.placeToInstruction.set(exprPlace.id, exprInstr);
    }
  }
}
