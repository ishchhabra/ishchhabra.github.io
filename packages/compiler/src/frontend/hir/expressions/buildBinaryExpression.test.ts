import { describe, expect, it } from "vitest";
import type { BinaryExpression, Node } from "oxc-parser";
import { BinaryExpressionOp } from "../../../ir";
import { buildFn, findAstNode, makeIsolatedHarness, printFn, printOps } from "../__testing__/ir";
import { buildBinaryExpression } from "./buildBinaryExpression";

function buildBinaryFromSource(source: string): {
  harness: ReturnType<typeof makeIsolatedHarness>;
  op: BinaryExpressionOp;
} {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is BinaryExpression => n.type === "BinaryExpression",
  );
  buildBinaryExpression(node, harness.scope, harness.fnBuilder, harness.moduleBuilder, harness.env);
  const ops = harness.fnBuilder.currentBlock.operations;
  const op = ops[ops.length - 1];
  if (!(op instanceof BinaryExpressionOp)) {
    throw new Error("expected last op to be BinaryExpressionOp");
  }
  return { harness, op };
}

// -----------------------------------------------------------------
// Smoke test — one end-to-end assertion to confirm the isolated
// builder composes correctly with its dispatch wrappers. Per-case
// coverage lives in the isolated suite below.
// -----------------------------------------------------------------

describe("buildBinaryExpression — end-to-end smoke", () => {
  it("renders through the full HIR pipeline", () => {
    expect(printFn(buildFn("a + b;"))).toBe(
      ["bb0:", "  $0 = LoadGlobal a", "  $1 = LoadGlobal b", '  $2 = binary "+" $0, $1'].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated — direct invocation of buildBinaryExpression on a parsed
// AST node. Primary test surface.
// -----------------------------------------------------------------

describe("buildBinaryExpression — isolated", () => {
  it("appends sub-builds then the op, in source order", () => {
    const { harness } = buildBinaryFromSource("a + b;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      ["$0 = LoadGlobal a", "$1 = LoadGlobal b", '$2 = binary "+" $0, $1'].join("\n"),
    );
  });

  it("handles literal operands", () => {
    const { harness } = buildBinaryFromSource("1 + 2;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      ["$0 = 1", "$1 = 2", '$2 = binary "+" $0, $1'].join("\n"),
    );
  });

  it("handles nested binary expressions left-associatively", () => {
    // Nested BinaryExpression: findAstNode DFS finds the outer node
    // first (it's the top-level expression); sub-builds recurse.
    const { harness } = buildBinaryFromSource("a + b + c;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      [
        "$0 = LoadGlobal a",
        "$1 = LoadGlobal b",
        '$2 = binary "+" $0, $1',
        "$3 = LoadGlobal c",
        '$4 = binary "+" $2, $3',
      ].join("\n"),
    );
  });

  describe("semantics", () => {
    it("wires left and right to the sub-build result places", () => {
      const { harness, op } = buildBinaryFromSource("a + b;");
      const [loadA, loadB] = harness.fnBuilder.currentBlock.operations;
      expect(op.left).toBe(loadA.place);
      expect(op.right).toBe(loadB.place);
    });

    it("getOperands returns [left, right] in source order", () => {
      const { op } = buildBinaryFromSource("a + b;");
      expect(op.getOperands()).toEqual([op.left, op.right]);
    });

    it("is pure — hasSideEffects is false", () => {
      const { op } = buildBinaryFromSource("a + b;");
      expect(op.hasSideEffects()).toBe(false);
    });
  });

  describe("operator forwarding", () => {
    const operators = [
      "==",
      "!=",
      "===",
      "!==",
      "<",
      "<=",
      ">",
      ">=",
      "<<",
      ">>",
      ">>>",
      "+",
      "-",
      "*",
      "/",
      "%",
      "**",
      "|",
      "^",
      "&",
      "in",
      "instanceof",
    ] as const;

    it.each(operators)("forwards `%s` verbatim", (operator) => {
      const { op } = buildBinaryFromSource(`a ${operator} b;`);
      expect(op.operator).toBe(operator);
    });
  });
});

// Note: the `PrivateIdentifier` throw inside `buildBinaryExpression`
// is defensive — the parser only legally produces one on the LHS of
// `#x in obj`, and private class fields aren't supported upstream, so
// there's no source-level test that reaches that branch today.
