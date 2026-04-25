import { describe, expect, it } from "vitest";
import type { LogicalExpression, Node } from "oxc-parser";
import { BinaryExpressionOp, IfTermOp, JumpTermOp, LiteralOp } from "../../../ir";
import { buildFn, findAstNode, makeIsolatedHarness, printFn } from "../__testing__/ir";
import { buildLogicalExpression } from "./buildLogicalExpression";

/**
 * Tests the CFG-pivot shape: `a && b` → IfTermOp(a, thenBlock, elseBlock,
 * joinBlock). Arm blocks terminate with JumpTermOp(joinBlock, [value]).
 * Join block has a single block-parameter that receives the merged
 * value. Builder returns that block-param as the expression's Value.
 */

function buildLogicalFromSource(source: string): {
  harness: ReturnType<typeof makeIsolatedHarness>;
  term: IfTermOp;
  leftPlace: import("../../../ir").Value;
  resultPlace: import("../../../ir").Value;
} {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is LogicalExpression => n.type === "LogicalExpression",
  );
  // Block id BEFORE the build — after the build, the caller's
  // currentBlock is the joinBlock, so we snapshot the parent here.
  const parentBlockId = harness.fnBuilder.currentBlock.id;
  const resultPlace = buildLogicalExpression(
    node,
    harness.scope,
    harness.fnBuilder,
    harness.moduleBuilder,
    harness.env,
  );

  // Locate the IfTermOp on the original parent block.
  const parentBlock = harness.fnBuilder.blocks.find(
    (b) => b.id === parentBlockId,
  );
  if (!parentBlock) throw new Error("parent block missing");
  const term = parentBlock.terminal;
  if (!(term instanceof IfTermOp)) {
    throw new Error(`expected IfTermOp terminal, got ${term?.constructor.name}`);
  }
  // The immediate operands of IfTermOp's condition are the LHS (for
  // `&&`/`||`) or the `!= null` binary (for `??`). The pre-IfTermOp
  // ops in parentBlock still exist; the last non-terminator op's
  // place is either the LHS directly or the `!= null` result.
  const leftPlace =
    parentBlock.operations.length > 0
      ? parentBlock.operations[parentBlock.operations.length - 1].place!
      : term.cond;
  return { harness, term, leftPlace, resultPlace };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildLogicalExpression — end-to-end smoke", () => {
  it("lowers && to an IfTermOp with JumpTermOp arms in HIR", () => {
    const fn = buildFn("a && b;");
    const ir = printFn(fn);
    expect(ir).toContain("IfTermOp");
    expect(ir).toContain("LoadGlobal a");
    expect(ir).toContain("LoadGlobal b");
  });

  it("lowers || to an IfTermOp with JumpTermOp arms in HIR", () => {
    const fn = buildFn("a || b;");
    expect(printFn(fn)).toContain("IfTermOp");
  });

  it("lowers ?? to an IfTermOp with a `!= null` test in HIR", () => {
    const fn = buildFn("a ?? b;");
    const ir = printFn(fn);
    expect(ir).toContain("IfTermOp");
    expect(ir).toContain('binary "!="');
    expect(ir).toContain("LoadGlobal a");
    expect(ir).toContain("LoadGlobal b");
  });
});

// -----------------------------------------------------------------
// Isolated — CFG shape
// -----------------------------------------------------------------

describe("buildLogicalExpression — isolated", () => {
  describe("IfTermOp shape", () => {
    it("& produces an IfTermOp with three distinct successor blocks", () => {
      const { term } = buildLogicalFromSource("a && b;");
      expect(term).toBeInstanceOf(IfTermOp);
      expect(term.thenBlock).toBeDefined();
      expect(term.elseBlock).toBeDefined();
      expect(term.fallthroughBlock).toBeDefined();
      // All three blocks must be distinct instances
      expect(term.thenBlock).not.toBe(term.elseBlock);
      expect(term.thenBlock).not.toBe(term.fallthroughBlock);
      expect(term.elseBlock).not.toBe(term.fallthroughBlock);
    });

    it("fallthrough (join) block has exactly one block parameter", () => {
      const { term } = buildLogicalFromSource("a && b;");
      expect(term.fallthroughBlock.params.length).toBe(1);
    });

    it("returns the fallthrough block's single block-param as the result value", () => {
      const { term, resultPlace } = buildLogicalFromSource("a && b;");
      expect(resultPlace).toBe(term.fallthroughBlock.params[0]);
    });

    it("leaves currentBlock set to the join block after returning", () => {
      const { harness, term } = buildLogicalFromSource("a && b;");
      expect(harness.fnBuilder.currentBlock).toBe(term.fallthroughBlock);
    });

    it("both arm blocks end in a JumpTermOp targeting the join block", () => {
      const { term } = buildLogicalFromSource("a && b;");
      const thenJump = term.thenBlock.terminal;
      const elseJump = term.elseBlock.terminal;
      expect(thenJump).toBeInstanceOf(JumpTermOp);
      expect(elseJump).toBeInstanceOf(JumpTermOp);
      expect((thenJump as JumpTermOp).target).toBe(term.fallthroughBlock);
      expect((elseJump as JumpTermOp).target).toBe(term.fallthroughBlock);
    });

    it("both arm JumpOps carry exactly one block-arg (matching join's param count)", () => {
      const { term } = buildLogicalFromSource("a && b;");
      const thenArgs = (term.thenBlock.terminal as JumpTermOp).args;
      const elseArgs = (term.elseBlock.terminal as JumpTermOp).args;
      expect(thenArgs.length).toBe(1);
      expect(elseArgs.length).toBe(1);
    });
  });

  describe("&& operator", () => {
    it("uses the LHS directly as the IfTermOp condition (no wrapper)", () => {
      const { term, leftPlace } = buildLogicalFromSource("a && b;");
      expect(term.cond).toBe(leftPlace);
    });

    it("truthy arm evaluates RHS (operations present)", () => {
      const { term } = buildLogicalFromSource("a && b;");
      // RHS evaluation emits at least one op (LoadGlobal b).
      expect(term.thenBlock.operations.length).toBeGreaterThan(0);
    });

    it("falsy arm does NOT evaluate RHS (short-circuit)", () => {
      const { term } = buildLogicalFromSource("a && b;");
      // Falsy arm just passthrough — no operations before the jump.
      expect(term.elseBlock.operations.length).toBe(0);
    });

    it("falsy arm passes the LHS value as the block-arg", () => {
      const { term, leftPlace } = buildLogicalFromSource("a && b;");
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(args[0]).toBe(leftPlace);
    });

    it("truthy arm passes the RHS-computed value (not LHS) as the block-arg", () => {
      const { term, leftPlace } = buildLogicalFromSource("a && b;");
      const args = (term.thenBlock.terminal as JumpTermOp).args;
      expect(args[0]).not.toBe(leftPlace);
    });
  });

  describe("|| operator", () => {
    it("uses the LHS directly as the IfTermOp condition", () => {
      const { term, leftPlace } = buildLogicalFromSource("a || b;");
      expect(term.cond).toBe(leftPlace);
    });

    it("truthy arm passes LHS through (short-circuit)", () => {
      const { term, leftPlace } = buildLogicalFromSource("a || b;");
      expect(term.thenBlock.operations.length).toBe(0);
      const args = (term.thenBlock.terminal as JumpTermOp).args;
      expect(args[0]).toBe(leftPlace);
    });

    it("falsy arm evaluates RHS and passes it through", () => {
      const { term, leftPlace } = buildLogicalFromSource("a || b;");
      expect(term.elseBlock.operations.length).toBeGreaterThan(0);
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(args[0]).not.toBe(leftPlace);
    });
  });

  describe("?? operator", () => {
    it("computes `lhs != null` as the test expression before the IfTermOp", () => {
      const { harness, term } = buildLogicalFromSource("a ?? b;");
      const ops = harness.fnBuilder.currentBlock.operations;
      // currentBlock is now joinBlock — parent block's ops are:
      //   LoadGlobal a, LiteralOp null, BinaryExpression `!=`
      // Navigate back to the parent via term.
      const parent = harness.fnBuilder.blocks.find(
        (b) => b.terminal === term,
      )!;
      const pOps = parent.operations;
      const binary = pOps.find((o) => o instanceof BinaryExpressionOp) as
        | BinaryExpressionOp
        | undefined;
      expect(binary).toBeDefined();
      expect(binary!.operator).toBe("!=");
      const literal = pOps.find((o) => o instanceof LiteralOp) as LiteralOp | undefined;
      expect(literal).toBeDefined();
      expect(literal!.value).toBe(null);
      // The IfTermOp's condition is the BinaryExpression's result, not the LHS directly.
      expect(term.cond).toBe(binary!.place);
      expect(term.cond).not.toBe(harness.fnBuilder.currentBlock.params[0]);
      // Silence unused
      void ops;
    });

    it("truthy arm (lhs != null) passes LHS through — short-circuit", () => {
      const { term, harness } = buildLogicalFromSource("a ?? b;");
      const parent = harness.fnBuilder.blocks.find(
        (b) => b.terminal === term,
      )!;
      const loadA = parent.operations.find(
        (o) => o.print().includes("LoadGlobal a"),
      );
      expect(term.thenBlock.operations.length).toBe(0);
      const args = (term.thenBlock.terminal as JumpTermOp).args;
      expect(args[0]).toBe(loadA!.place);
    });

    it("falsy arm (lhs is nullish) evaluates RHS and passes it", () => {
      const { term } = buildLogicalFromSource("a ?? b;");
      expect(term.elseBlock.operations.length).toBeGreaterThan(0);
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      // RHS value is a LoadGlobal b result, not LHS.
      const rhsOp = term.elseBlock.operations[term.elseBlock.operations.length - 1];
      expect(args[0]).toBe(rhsOp.place);
    });
  });

  describe("invariants", () => {
    it("generates three fresh blocks (thenBlock, elseBlock, fallthroughBlock are newly created)", () => {
      const { harness, term } = buildLogicalFromSource("a && b;");
      const allBlocks = harness.fnBuilder.blocks;
      // The three blocks are distinct and exist in the function body.
      expect(allBlocks).toContain(term.thenBlock);
      expect(allBlocks).toContain(term.elseBlock);
      expect(allBlocks).toContain(term.fallthroughBlock);
    });

    it("joinBlock.params[0] and returned resultPlace are the same identity", () => {
      const { term, resultPlace } = buildLogicalFromSource("a || b;");
      expect(resultPlace).toBe(term.fallthroughBlock.params[0]);
    });
  });
});
