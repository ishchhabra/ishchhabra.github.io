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

  it("scopes for-statement lexical declarations to the loop", () => {
    const { graph, program } = analyzeSource(
      "function run() { let n = 10; for (let n = 0; n < 2; n++) { n; } n; }",
    );
    const fn = functionDeclarationAt(program, 0);
    const functionScope = graph.scopeForOwner(fn);
    const outerDeclaration = declarationByName(functionScope, "n");
    const forStatement = fn.body?.body[1];

    if (forStatement?.type !== "ForStatement") {
      throw new Error("Expected for statement");
    }

    const loopScope = graph.scopeForOwner(forStatement);
    const loopDeclaration = declarationByName(loopScope, "n");

    expect(loopDeclaration).not.toBe(outerDeclaration);
    expect(loopDeclaration).toMatchObject({ kind: "lexical", mode: "let" });

    if (forStatement.test?.type !== "BinaryExpression") {
      throw new Error("Expected binary loop test");
    }

    expect(graph.declarationForReference(identifierExpression(forStatement.test.left))).toBe(
      loopDeclaration,
    );

    if (
      forStatement.update?.type !== "UpdateExpression" ||
      forStatement.update.argument.type !== "Identifier"
    ) {
      throw new Error("Expected update expression");
    }

    expect(graph.declarationForReference(forStatement.update.argument)).toBe(loopDeclaration);

    if (forStatement.body.type !== "BlockStatement") {
      throw new Error("Expected block loop body");
    }

    const bodyStatement = forStatement.body.body[0];
    if (bodyStatement?.type !== "ExpressionStatement") {
      throw new Error("Expected loop body expression");
    }

    expect(graph.declarationForReference(identifierExpression(bodyStatement.expression))).toBe(
      loopDeclaration,
    );

    const afterLoop = fn.body?.body[2];
    if (afterLoop?.type !== "ExpressionStatement") {
      throw new Error("Expected post-loop expression");
    }

    expect(graph.declarationForReference(identifierExpression(afterLoop.expression))).toBe(
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

  it("records captures for nested function references", () => {
    const { graph, program } = analyzeSource(
      "function outer(x) { return function inner() { return x; }; }",
    );
    const outer = functionDeclarationAt(program, 0);
    const outerScope = graph.scopeForOwner(outer);
    const x = declarationByName(outerScope, "x");
    const statement = outer.body?.body[0];

    if (statement?.type !== "ReturnStatement") {
      throw new Error("Expected return statement");
    }

    const inner = statement.argument;
    if (inner?.type !== "FunctionExpression") {
      throw new Error("Expected returned function expression");
    }

    expect(graph.capturesForOwner(inner)).toEqual([x]);
    expect(graph.capturesForOwner(outer)).toEqual([]);
  });

  it("records transitive captures through intermediate functions", () => {
    const { graph, program } = analyzeSource(
      "function outer(x) { return function middle() { return function inner() { return x; }; }; }",
    );
    const outer = functionDeclarationAt(program, 0);
    const x = declarationByName(graph.scopeForOwner(outer), "x");
    const outerReturn = outer.body?.body[0];

    if (outerReturn?.type !== "ReturnStatement") {
      throw new Error("Expected outer return statement");
    }

    const middle = outerReturn.argument;
    if (middle?.type !== "FunctionExpression") {
      throw new Error("Expected middle function expression");
    }

    const middleReturn = middle.body?.body[0];
    if (middleReturn?.type !== "ReturnStatement") {
      throw new Error("Expected middle return statement");
    }

    const inner = middleReturn.argument;
    if (inner?.type !== "FunctionExpression") {
      throw new Error("Expected inner function expression");
    }

    expect(graph.capturesForOwner(middle)).toEqual([x]);
    expect(graph.capturesForOwner(inner)).toEqual([x]);
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
