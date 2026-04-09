import {
  BasicBlock,
  BlockId,
  LiteralInstruction,
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
 * Eliminates phis by materializing edge assignments into the target binding.
 */
export class SSAEliminator {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): SSAEliminationResult {
    for (const phi of this.functionIR.phis) {
      if (phi.operands.size === 0) {
        continue;
      }

      this.#insertPhiDeclaration(phi);
      this.#insertPhiStores(phi);
    }

    return { blocks: this.functionIR.blocks };
  }

  #insertPhiDeclaration(phi: Phi) {
    const declaration = this.moduleIR.environment.declToPlaces.get(phi.declarationId)?.[0];
    if (declaration === undefined) {
      throw new Error(`Declaration place not found for ${phi.declarationId}`);
    }

    const declarationBlock = this.functionIR.getBlock(declaration.blockId);
    this.moduleIR.environment.ensureSyntheticDeclarationMetadata(
      phi.place.identifier.declarationId,
      "let",
      phi.place,
    );

    const undefinedId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const undefinedPlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(),
    );
    const undefinedInstr = new LiteralInstruction(undefinedId, undefinedPlace, undefined);
    declarationBlock.appendInstruction(undefinedInstr);
    this.moduleIR.environment.placeToInstruction.set(undefinedPlace.id, undefinedInstr);

    const storeId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const storePlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
    );
    const storeInstr = new StoreLocalInstruction(
      storeId,
      storePlace,
      phi.place,
      undefinedPlace,
      "let",
      "declaration",
    );
    declarationBlock.appendInstruction(storeInstr);
    this.moduleIR.environment.placeToInstruction.set(storePlace.id, storeInstr);
  }

  #insertPhiStores(phi: Phi) {
    for (const [blockId, place] of phi.operands) {
      const block = this.functionIR.getBlock(blockId);
      const storeId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
      const storePlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
      );
      const storeInstr = new StoreLocalInstruction(
        storeId,
        storePlace,
        phi.place,
        place,
        "let",
        "assignment",
      );
      block.appendInstruction(storeInstr);
      this.moduleIR.environment.placeToInstruction.set(storePlace.id, storeInstr);
    }
  }
}
