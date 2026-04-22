import { describe, expect, it } from "vitest";
import type { LogicalExpression, Node } from "oxc-parser";
import { BinaryExpressionOp, IfOp, LiteralOp, LoadGlobalOp, YieldOp } from "../../../ir";
import { compileFromSource } from "../../../compile";
import { buildFn, findAstNode, makeIsolatedHarness, printFn } from "../__testing__/ir";
import { buildLogicalExpression } from "./buildLogicalExpression";

function buildLogicalFromSource(source: string) {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is LogicalExpression => n.type === "LogicalExpression",
  );
  const opsBefore = harness.fnBuilder.currentBlock.operations.length;
  buildLogicalExpression(
    node,
    harness.scope,
    harness.fnBuilder,
    harness.moduleBuilder,
    harness.env,
  );
  const opsAdded = harness.fnBuilder.currentBlock.operations.slice(opsBefore);
  return { harness, opsAdded };
}

// -----------------------------------------------------------------
// Correctness regression — the motivating bug
// -----------------------------------------------------------------
//
// Pre-fix, `true || side();` emitted `side();` unconditionally
// because the eager `LogicalExpressionOp` was DCE'd and the call
// survived as an unguarded statement. The IfOp lowering puts
// `side()` inside an else-branch that's proven unreachable at
// runtime — it still appears in the compiled output syntactically
// but can never execute.

describe("buildLogicalExpression — correctness", () => {
  it("`true || side();` does not emit an unconditional call to side()", () => {
    const output = compileFromSource("true || side();");
    // Compiled JS wraps the call in `if (true) { ... } else { side(); }`
    // or similar — key invariant: `side()` is never the leading statement
    // of an unguarded block.
    expect(output.trim().startsWith("side()")).toBe(false);
  });

  it("`false && side();` does not emit an unconditional call to side()", () => {
    const output = compileFromSource("false && side();");
    expect(output.trim().startsWith("side()")).toBe(false);
  });

  it("`x ?? side();` gates side() behind a null check", () => {
    const output = compileFromSource("let x; x ?? side();");
    // The `side()` invocation must appear inside a conditional block,
    // not as a bare top-level statement.
    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const bareSideLine = lines.find((l) => l === "side();");
    expect(bareSideLine).toBeUndefined();
  });
});

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildLogicalExpression — end-to-end smoke", () => {
  it("lowers to IfOp with yields in HIR", () => {
    const printed = printFn(buildFn("a || b;"));
    expect(printed).toContain("IfOp");
    expect(printed).toContain("yield");
  });
});

// -----------------------------------------------------------------
// Isolated — shape of the lowered IR
// -----------------------------------------------------------------

describe("buildLogicalExpression — isolated", () => {
  describe("&& lowering", () => {
    it("consequent yields build(RHS), alternate yields LHS", () => {
      const { opsAdded } = buildLogicalFromSource("a && b;");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp);
      expect(ifOp).toBeDefined();

      // Test operand = the LHS value directly (no extra comparison).
      const loadA = opsAdded.find(
        (o): o is LoadGlobalOp => o instanceof LoadGlobalOp && o.name === "a",
      )!;
      expect(ifOp!.test).toBe(loadA.place);

      // Consequent region builds the RHS then yields it.
      const consBlock = ifOp!.consequentRegion.entry;
      const consLoadB = consBlock.operations[0] as LoadGlobalOp;
      expect(consLoadB).toBeInstanceOf(LoadGlobalOp);
      expect(consLoadB.name).toBe("b");
      const consYield = consBlock.terminal as YieldOp;
      expect(consYield).toBeInstanceOf(YieldOp);
      expect(consYield.values[0]).toBe(consLoadB.place);

      // Alternate region is empty — just yields the LHS (short-circuit).
      const altBlock = ifOp!.alternateRegion!.entry;
      expect(altBlock.operations.length).toBe(0);
      const altYield = altBlock.terminal as YieldOp;
      expect(altYield).toBeInstanceOf(YieldOp);
      expect(altYield.values[0]).toBe(loadA.place);
    });

    it("RHS is NOT built in the parent block (short-circuit)", () => {
      const { opsAdded } = buildLogicalFromSource("a && b;");
      const parentLoads = opsAdded.filter((o): o is LoadGlobalOp => o instanceof LoadGlobalOp);
      // Only the LHS load should be in the parent block; RHS is inside
      // the consequent region.
      expect(parentLoads.length).toBe(1);
      expect(parentLoads[0].name).toBe("a");
    });
  });

  describe("|| lowering", () => {
    it("consequent yields LHS, alternate yields build(RHS)", () => {
      const { opsAdded } = buildLogicalFromSource("a || b;");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;

      const loadA = opsAdded.find(
        (o): o is LoadGlobalOp => o instanceof LoadGlobalOp && o.name === "a",
      )!;
      expect(ifOp.test).toBe(loadA.place);

      // Consequent: short-circuit — yield LHS directly.
      const consBlock = ifOp.consequentRegion.entry;
      expect(consBlock.operations.length).toBe(0);
      const consYield = consBlock.terminal as YieldOp;
      expect(consYield.values[0]).toBe(loadA.place);

      // Alternate: build RHS and yield.
      const altBlock = ifOp.alternateRegion!.entry;
      const altLoadB = altBlock.operations[0] as LoadGlobalOp;
      expect(altLoadB.name).toBe("b");
      const altYield = altBlock.terminal as YieldOp;
      expect(altYield.values[0]).toBe(altLoadB.place);
    });
  });

  describe("?? lowering", () => {
    it("test is `LHS != null`; consequent yields LHS, alternate yields build(RHS)", () => {
      const { opsAdded } = buildLogicalFromSource("a ?? b;");

      const loadA = opsAdded.find(
        (o): o is LoadGlobalOp => o instanceof LoadGlobalOp && o.name === "a",
      )!;
      const nullLit = opsAdded.find(
        (o): o is LiteralOp => o instanceof LiteralOp && o.value === null,
      )!;
      const cmp = opsAdded.find((o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp)!;
      expect(cmp.operator).toBe("!=");
      expect(cmp.left).toBe(loadA.place);
      expect(cmp.right).toBe(nullLit.place);

      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      expect(ifOp.test).toBe(cmp.place);

      // Consequent (non-nullish): yield LHS.
      const consBlock = ifOp.consequentRegion.entry;
      const consYield = consBlock.terminal as YieldOp;
      expect(consYield.values[0]).toBe(loadA.place);

      // Alternate (nullish): yield build(RHS).
      const altBlock = ifOp.alternateRegion!.entry;
      const altLoadB = altBlock.operations[0] as LoadGlobalOp;
      expect(altLoadB.name).toBe("b");
      const altYield = altBlock.terminal as YieldOp;
      expect(altYield.values[0]).toBe(altLoadB.place);
    });
  });

  describe("IfOp invariants", () => {
    it("produces a single result place", () => {
      for (const src of ["a && b;", "a || b;", "a ?? b;"]) {
        const { opsAdded } = buildLogicalFromSource(src);
        const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
        expect(ifOp.resultPlaces.length).toBe(1);
      }
    });

    it("has both consequent and alternate regions", () => {
      for (const src of ["a && b;", "a || b;", "a ?? b;"]) {
        const { opsAdded } = buildLogicalFromSource(src);
        const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
        expect(ifOp.consequentRegion).toBeDefined();
        expect(ifOp.alternateRegion).toBeDefined();
      }
    });
  });
});
