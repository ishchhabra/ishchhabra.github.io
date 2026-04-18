import { Environment } from "../../../environment";
import { createOperationId, Region, TryOp, YieldOp } from "../../../ir";
import type { TryStatement } from "oxc-parser";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildTryStatement(
  node: TryStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const parentBlock = functionBuilder.currentBlock;

  const hasHandler = node.handler !== null;
  const hasFinalizer = node.finalizer !== null;

  const tryRegion = new Region([]);
  const tryBlock = environment.createBlock();
  functionBuilder.withStructureRegion(tryRegion, () => {
    functionBuilder.addBlock(tryBlock);
    functionBuilder.currentBlock = tryBlock;
    buildOwnedBody(node.block, scope, functionBuilder, moduleBuilder, environment);
    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
    }
  });

  let handler: {
    param: import("../../../ir").Value | null;
    region: Region;
  } | null = null;
  if (hasHandler) {
    const catchClause = node.handler!;
    const catchScope = functionBuilder.scopeFor(catchClause);
    const catchRegion = new Region([]);
    const handlerBlock = environment.createBlock();

    let paramPlace: import("../../../ir").Value | null = null;
    functionBuilder.withStructureRegion(catchRegion, () => {
      functionBuilder.addBlock(handlerBlock);
      functionBuilder.currentBlock = handlerBlock;

      if (catchClause.param != null && catchClause.param.type === "Identifier") {
        const identifier = environment.createValue();
        functionBuilder.registerDeclarationName(
          catchClause.param.name,
          identifier.declarationId,
          catchScope,
        );
        functionBuilder.instantiateDeclaration(
          identifier.declarationId,
          "catch",
          catchClause.param.name,
          catchScope,
        );
        const bindingPlace = identifier;

        environment.registerDeclaration(
          identifier.declarationId,
          functionBuilder.currentBlock.id,
          bindingPlace,
        );
        environment.setDeclarationBinding(identifier.declarationId, bindingPlace);

        paramPlace = bindingPlace;
      }

      buildOwnedBody(catchClause.body, scope, functionBuilder, moduleBuilder, environment);

      if (functionBuilder.currentBlock.terminal === undefined) {
        functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
      }
    });

    handler = { param: paramPlace, region: catchRegion };
  }

  let finallyRegion: Region | null = null;
  if (hasFinalizer) {
    finallyRegion = new Region([]);
    const finallyBlock = environment.createBlock();
    functionBuilder.withStructureRegion(finallyRegion, () => {
      functionBuilder.addBlock(finallyBlock);
      functionBuilder.currentBlock = finallyBlock;
      buildOwnedBody(node.finalizer!, scope, functionBuilder, moduleBuilder, environment);
      if (functionBuilder.currentBlock.terminal === undefined) {
        functionBuilder.currentBlock.terminal = new YieldOp(createOperationId(environment), []);
      }
    });
  }

  const tryOp = new TryOp(createOperationId(environment), tryRegion, handler, finallyRegion);
  parentBlock.appendOp(tryOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}
