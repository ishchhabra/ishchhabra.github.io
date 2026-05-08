import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  declarationByName,
  declarationNames,
  functionDeclarationAt,
  identifierExpression,
  programStatementAt,
} from "./testing";

describe("analyzeScopes", () => {
  it("records the module scope for an empty program", () => {
    const { graph, program } = analyzeSource("");

    expect(graph.scopeForOwner(program)).toBe(graph.programScope);
    expect(declarationNames(graph.programScope)).toEqual([]);
  });

  it("records block-scoped lexical declarations", () => {
    const { graph, instantiation, program } = analyzeSource("{ let x; }");
    const block = programStatementAt(program, 0, "BlockStatement");
    const blockScope = graph.scopeForOwner(block);
    const declaration = declarationByName(blockScope, "x");

    expect(declaration).toMatchObject({ kind: "lexical", mode: "let" });
    expect(graph.programScope.getLocal("x")).toBeUndefined();
    expect(instantiation.declarationsForScope(blockScope).lexicals).toEqual([declaration]);
  });

  it("hoists var declarations to the nearest var scope", () => {
    const { graph, instantiation, program } = analyzeSource("{ var x; }");
    const block = programStatementAt(program, 0, "BlockStatement");
    const blockScope = graph.scopeForOwner(block);
    const declaration = declarationByName(graph.programScope, "x");

    expect(declaration).toMatchObject({ kind: "var" });
    expect(blockScope.getLocal("x")).toBeUndefined();
    expect(instantiation.declarationsForScope(graph.programScope).vars).toEqual([declaration]);
  });

  it("resolves references through parent scopes", () => {
    const { graph, program } = analyzeSource("let x; { x; }");
    const declaration = declarationByName(graph.programScope, "x");
    const block = programStatementAt(program, 1, "BlockStatement");
    const statement = block.body[0];

    expect(statement?.type).toBe("ExpressionStatement");
    if (statement?.type !== "ExpressionStatement") return;

    expect(graph.declarationForReference(identifierExpression(statement.expression))).toBe(
      declaration,
    );
  });

  it("resolves shadowed references to the nearest declaration", () => {
    const { graph, program } = analyzeSource("let x; { let x; x; }");
    const outerDeclaration = declarationByName(graph.programScope, "x");
    const block = programStatementAt(program, 1, "BlockStatement");
    const blockScope = graph.scopeForOwner(block);
    const innerDeclaration = declarationByName(blockScope, "x");
    const statement = block.body[1];

    expect(statement?.type).toBe("ExpressionStatement");
    if (statement?.type !== "ExpressionStatement") return;

    expect(graph.declarationForReference(identifierExpression(statement.expression))).toBe(
      innerDeclaration,
    );
    expect(graph.declarationForReference(identifierExpression(statement.expression))).not.toBe(
      outerDeclaration,
    );
  });

  it("records function declarations and parameter bindings", () => {
    const { graph, program } = analyzeSource("function f(a) { a; }");
    const declaration = declarationByName(graph.programScope, "f");
    const fn = functionDeclarationAt(program, 0);
    const functionScope = graph.scopeForOwner(fn);
    const param = declarationByName(functionScope, "a");

    expect(declaration).toMatchObject({
      kind: "function",
      functionKind: "function",
    });
    expect(param).toMatchObject({ kind: "parameter" });
    const body = fn.body;
    if (body === null) {
      throw new Error("Expected function declaration body");
    }

    const statement = body.body[0];

    expect(statement?.type).toBe("ExpressionStatement");
    if (statement?.type !== "ExpressionStatement") return;

    expect(graph.scopeForOwner(body)).toBe(functionScope);
    expect(graph.declarationForReference(identifierExpression(statement.expression))).toBe(param);
  });

  it("records import bindings and resolves references to them", () => {
    const { graph, program } = analyzeSource('import { x as y } from "m"; y;');
    const declaration = declarationByName(graph.programScope, "y");
    const statement = programStatementAt(program, 1, "ExpressionStatement");

    expect(declaration).toMatchObject({
      kind: "import",
      importedName: "x",
      source: "m",
    });
    expect(graph.declarationForReference(identifierExpression(statement.expression))).toBe(
      declaration,
    );
  });

  it("records unresolved references as global references", () => {
    const { graph, program } = analyzeSource("foo;");
    const statement = programStatementAt(program, 0, "ExpressionStatement");
    const reference = identifierExpression(statement.expression);

    expect(graph.isGlobalReference(reference)).toBe(true);
    expect(() => graph.declarationForReference(reference)).toThrow("Identifier foo is not bound");
  });
});
