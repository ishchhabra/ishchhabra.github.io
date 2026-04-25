import * as t from "@babel/types";
import { FunctionDeclarationOp } from "../../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

/**
 * Idempotent. Repeated calls on the same op return the same AST
 * node. Consumers that need the declaration AST (statement
 * emission, export embedding) walk def-use edges to locate the
 * producing op and call this function directly — no lookup map
 * needed.
 */
export function generateFunctionDeclarationOp(
  instruction: FunctionDeclarationOp,
  generator: CodeGenerator,
): t.FunctionDeclaration {
  const cached = generator.declarationAstCache.get(instruction);
  if (cached !== undefined) return cached as t.FunctionDeclaration;

  const { params, statements } = generateFunction(
    instruction.funcOp,
    instruction.captures,
    generator,
  );
  const name = instruction.place.name ?? `$${instruction.place.id}`;
  const decl = t.functionDeclaration(
    t.identifier(name),
    params,
    t.blockStatement(statements),
    instruction.generator,
    instruction.async,
  );
  generator.declarationAstCache.set(instruction, decl);
  generator.declaredDeclarations.add(instruction.place.declarationId);

  // `values` holds expression-compatible references. Use sites
  // (JSX tags, calls, exports specifiers, loads) see an Identifier
  // naming this function; the declaration statement itself is
  // emitted separately by the block walker or embedded by an
  // enclosing export op via def-use traversal.
  generator.values.set(instruction.place.id, t.identifier(name));
  return decl;
}
