import { describe, expect, it } from "vitest";
import type { Node, UnaryExpression } from "oxc-parser";
import { UnaryExpressionOp } from "../../../ir";
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

    it("operands returns [argument]", () => {
      const { op } = buildUnaryFromSource("!a;");
      expect(op.operands()).toEqual([op.argument]);
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

  describe("five-axis effects", () => {
    // `typeof` and `void` are total: they don't throw on their
    // operand. Numeric / boolean unaries can throw via ToPrimitive
    // on object operands. `delete` writes a property slot.
    it("`typeof` doesn't throw and writes nothing", () => {
      const { op } = buildUnaryFromSource("typeof a;");
      expect(op.mayThrow()).toBe(false);
      expect(op.getMemoryEffects().writes.length).toBe(0);
    });

    it("`void` doesn't throw on its own", () => {
      const { op } = buildUnaryFromSource("void 0;");
      expect(op.mayThrow()).toBe(false);
      expect(op.getMemoryEffects().writes.length).toBe(0);
    });

    it("numeric / boolean unaries don't throw (preserves pre-five-axis behavior)", () => {
      for (const operator of ["-", "+", "!", "~"] as const) {
        const { op } = buildUnaryFromSource(`${operator} a;`);
        expect(op.mayThrow()).toBe(false);
      }
    });

    it("`delete` writes a property slot and may throw in strict mode", () => {
      const { op } = buildUnaryFromSource("delete o.x;");
      expect(op.getMemoryEffects().writes.length).toBeGreaterThan(0);
      expect(op.mayThrow()).toBe(true);
    });
  });
});
