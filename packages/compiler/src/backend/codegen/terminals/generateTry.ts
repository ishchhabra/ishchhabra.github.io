import * as t from "@babel/types";
import { TryOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateTryTerminal(
  terminal: TryOp,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Reserve blocks to prevent them from being pulled in during body generation.
  if (terminal.handler !== null) {
    generator.generatedBlocks.add(terminal.handler.block);
  }
  if (terminal.finallyBlock !== null) {
    generator.generatedBlocks.add(terminal.finallyBlock);
  }
  generator.generatedBlocks.add(terminal.fallthrough);

  // Generate the try body.
  const tryStatements = generateBlock(terminal.tryBlock, functionIR, generator);
  const tryBlock = t.blockStatement(tryStatements);

  // Generate the catch clause if present.
  let catchClause: t.CatchClause | null = null;
  if (terminal.handler !== null) {
    generator.generatedBlocks.delete(terminal.handler.block);

    let param: t.Identifier | null = null;
    if (terminal.handler.param !== null) {
      const paramNode = generator.places.get(terminal.handler.param.id);
      if (paramNode !== undefined && t.isIdentifier(paramNode)) {
        param = paramNode;
      }
    }

    const handlerStatements = generateBlock(terminal.handler.block, functionIR, generator);
    catchClause = t.catchClause(param, t.blockStatement(handlerStatements));
  }

  // Generate the finally block if present.
  let finallyBlock: t.BlockStatement | null = null;
  if (terminal.finallyBlock !== null) {
    generator.generatedBlocks.delete(terminal.finallyBlock);
    const finallyStatements = generateBlock(terminal.finallyBlock, functionIR, generator);
    finallyBlock = t.blockStatement(finallyStatements);
  }

  // Generate the fallthrough block.
  generator.generatedBlocks.delete(terminal.fallthrough);
  const fallthroughStatements = generateBlock(terminal.fallthrough, functionIR, generator);

  const tryStatement = t.tryStatement(tryBlock, catchClause, finallyBlock);
  return [tryStatement, ...fallthroughStatements];
}
