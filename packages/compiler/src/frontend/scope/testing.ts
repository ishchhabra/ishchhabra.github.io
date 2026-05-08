import type { Expression, Function, Program } from "oxc-parser";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { DeclarationTable } from "../declarations/DeclarationTable";
import { parseModule } from "../parse/parseModule";
import { analyzeScopes } from "./analyzeScopes";
import type { ScopeAnalysisResult } from "./analyzeScopes";
import type { IdentifierReferenceNode } from "../ast/types";
import type { Declaration } from "./Declaration";
import type { Scope } from "./Scope";

export interface ScopeAnalysisFixture extends ScopeAnalysisResult {
  readonly program: Program;
  readonly ids: IRIdAllocator;
  readonly declarations: DeclarationTable;
}

export function analyzeSource(source: string): ScopeAnalysisFixture {
  const program = parseModule("test.js", source);
  const ids = new IRIdAllocator();
  const declarations = new DeclarationTable();
  const analysis = analyzeScopes(program, { ids, declarations });

  return {
    program,
    ids,
    declarations,
    graph: analysis.graph,
    instantiation: analysis.instantiation,
  };
}

export function programStatementAt<Type extends Program["body"][number]["type"]>(
  program: Program,
  index: number,
  type: Type,
): Extract<Program["body"][number], { type: Type }> {
  const statement = program.body[index];

  if (statement === undefined) {
    throw new Error(`Expected statement at index ${index}`);
  }

  if (statement.type !== type) {
    throw new Error(`Expected statement ${index} to be ${type}, got ${statement.type}`);
  }

  return statement as Extract<Program["body"][number], { type: Type }>;
}

export function functionDeclarationAt(program: Program, index: number): Function {
  const statement = programStatementAt(program, index, "FunctionDeclaration");

  return statement as Function;
}

export function declarationNames(scope: Scope): string[] {
  return scope.declarations.map((declaration) => declaration.name);
}

export function declarationByName(scope: Scope, name: string): Declaration {
  const declaration = scope.getLocal(name);
  if (declaration === undefined) {
    throw new Error(`Expected declaration ${name}`);
  }

  return declaration;
}

export function identifierExpression(expression: Expression): IdentifierReferenceNode {
  if (expression.type !== "Identifier") {
    throw new Error(`Expected identifier expression, got ${expression.type}`);
  }

  return expression;
}
