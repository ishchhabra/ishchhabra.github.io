import { describe, expect, it } from "vitest";
import type { Node, UnaryExpression } from "oxc-parser";
import { UnaryExpressionOp } from "../../../ir";
import { ProjectEnvironment } from "../../../ProjectEnvironment";
import { Environment } from "../../../environment";
import { buildFn, findAstNode, makeIsolatedHarness, printFn, printOps } from "../__testing__/ir";
import { buildUnaryExpression } from "./buildUnaryExpression";

function buildUnaryFromSource(source: string): {
  harness: ReturnType<typeof makeIsolatedHarness>;
  op: UnaryExpressionOp;
} {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is UnaryExpression => n.type === "UnaryExpression",
  );
  buildUnaryExpression(node, harness.scope, harness.fnBuilder, harness.moduleBuilder, harness.env);
  const ops = harness.fnBuilder.currentBlock.operations;
  const op = ops[ops.length - 1];
  if (!(op instanceof UnaryExpressionOp)) {
    throw new Error("expected last op to be UnaryExpressionOp");
  }
  return { harness, op };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildUnaryExpression — end-to-end smoke", () => {
  it("renders through the full HIR pipeline", () => {
    expect(printFn(buildFn("!a;"))).toBe(
      ["bb0:", "  $0 = LoadGlobal a", '  $1 = unary "!" $0'].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated — direct invocation against a parsed AST node
// -----------------------------------------------------------------

describe("buildUnaryExpression — isolated", () => {
  it("appends sub-build then the op", () => {
    const { harness } = buildUnaryFromSource("!a;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      ["$0 = LoadGlobal a", '$1 = unary "!" $0'].join("\n"),
    );
  });

  it("handles literal argument", () => {
    const { harness } = buildUnaryFromSource("-1;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      ["$0 = 1", '$1 = unary "-" $0'].join("\n"),
    );
  });

  it("handles member-expression argument for `delete`", () => {
    const { harness } = buildUnaryFromSource("delete o.x;");
    expect(printOps(harness.fnBuilder.currentBlock.operations)).toBe(
      ["$0 = LoadGlobal o", '$1 = load_static_property $0, "x"', '$2 = unary "delete" $1'].join(
        "\n",
      ),
    );
  });

  describe("semantics", () => {
    it("wires argument to the sub-build result place", () => {
      const { harness, op } = buildUnaryFromSource("!a;");
      const [load] = harness.fnBuilder.currentBlock.operations;
      expect(op.argument).toBe(load.place);
    });

    it("getOperands returns [argument]", () => {
      const { op } = buildUnaryFromSource("!a;");
      expect(op.getOperands()).toEqual([op.argument]);
    });
  });

  describe("operator forwarding", () => {
    // Each operator uses a source form the parser will accept: `delete`
    // needs a reference-like argument; `void`/`typeof` take a generic
    // expression; the symbolic ops (+ - ! ~) are unary on an identifier.
    const cases = [
      { operator: "-", source: "-a;" },
      { operator: "+", source: "+a;" },
      { operator: "!", source: "!a;" },
      { operator: "~", source: "~a;" },
      { operator: "typeof", source: "typeof a;" },
      { operator: "void", source: "void a;" },
      { operator: "delete", source: "delete o.x;" },
    ] as const;

    it.each(cases)("forwards `$operator` verbatim", ({ operator, source }) => {
      const { op } = buildUnaryFromSource(source);
      expect(op.operator).toBe(operator);
    });
  });

  describe("purity", () => {
    // Need an Environment to call hasSideEffects — the isolated harness
    // gives us one per test. For the `void` case we construct a fresh
    // harness with a function-call argument to exercise the recursive
    // purity check.
    const env = new Environment(new ProjectEnvironment());

    it.each(["-", "+", "!", "~", "typeof"] as const)("`%s` is pure", (operator) => {
      const { op } = buildUnaryFromSource(`${operator} a;`);
      expect(op.hasSideEffects(env)).toBe(false);
    });

    it("`delete` has side effects", () => {
      const { op } = buildUnaryFromSource("delete o.x;");
      expect(op.hasSideEffects(env)).toBe(true);
    });

    it("`void` is pure when operand is pure", () => {
      const { op } = buildUnaryFromSource("void 0;");
      expect(op.hasSideEffects(env)).toBe(false);
    });

    it("`void` inherits side effects from its operand", () => {
      const { op } = buildUnaryFromSource("void fetch();");
      expect(op.hasSideEffects(env)).toBe(true);
    });
  });
});
