import { LiteralOp, makeOperationId, StoreLocalOp } from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Phi } from "./Phi";

/**
 * Eliminates phis by materializing edge assignments into the target binding.
 * Mutates `functionIR` in place; no return value.
 */
export class SSAEliminator {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): void {
    for (const phi of this.functionIR.phis) {
      if (phi.operands.size === 0) {
        continue;
      }

      this.#insertPhiDeclaration(phi);
      this.#insertPhiStores(phi);
    }
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

    const undefinedId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const undefinedPlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(),
    );
    const undefinedInstr = new LiteralOp(undefinedId, undefinedPlace, undefined);
    declarationBlock.appendOp(undefinedInstr);
    this.moduleIR.environment.placeToOp.set(undefinedPlace.id, undefinedInstr);

    const storeId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const storePlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
    );
    const storeInstr = new StoreLocalOp(
      storeId,
      storePlace,
      phi.place,
      undefinedPlace,
      "let",
      "declaration",
    );
    declarationBlock.appendOp(storeInstr);
    this.moduleIR.environment.placeToOp.set(storePlace.id, storeInstr);
  }

  #insertPhiStores(phi: Phi) {
    for (const [blockId, place] of phi.operands) {
      const block = this.functionIR.getBlock(blockId);
      const storeId = makeOperationId(this.moduleIR.environment.nextOperationId++);
      const storePlace = this.moduleIR.environment.createPlace(
        this.moduleIR.environment.createIdentifier(phi.place.identifier.declarationId),
      );
      const storeInstr = new StoreLocalOp(
        storeId,
        storePlace,
        phi.place,
        place,
        "let",
        "assignment",
      );
      block.appendOp(storeInstr);
      this.moduleIR.environment.placeToOp.set(storePlace.id, storeInstr);
    }
  }
}
