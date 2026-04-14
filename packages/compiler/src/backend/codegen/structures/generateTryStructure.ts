import * as t from "@babel/types";
import { TryOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `TryOp` as `try { ... } catch (e) { ... }
 * finally { ... }`.
 */
export function generateTryStructure(
  structure: TryOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const tryStatements = generateBasicBlock(structure.tryRegion.entry.id, funcOp, generator);
  const tryBlock = t.blockStatement(tryStatements);

  let handler: t.CatchClause | null = null;
  if (structure.handlerRegion !== null) {
    const handlerStatements = generateBasicBlock(
      structure.handlerRegion.entry.id,
      funcOp,
      generator,
    );
    let param: t.Identifier | null = null;
    if (structure.handlerParam !== null) {
      const paramIdent = generator.getPlaceIdentifier(structure.handlerParam);
      param = paramIdent;
    }
    handler = t.catchClause(param, t.blockStatement(handlerStatements));
  }

  let finalizer: t.BlockStatement | null = null;
  if (structure.finallyRegion !== null) {
    const finallyStatements = generateBasicBlock(
      structure.finallyRegion.entry.id,
      funcOp,
      generator,
    );
    finalizer = t.blockStatement(finallyStatements);
  }

  return [t.tryStatement(tryBlock, handler, finalizer)];
}
