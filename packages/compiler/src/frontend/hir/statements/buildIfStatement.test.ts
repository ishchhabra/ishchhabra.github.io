import { describe, expect, it } from "vitest";
import type { IfStatement, Node } from "oxc-parser";
import { IfOp, LoadGlobalOp, YieldOp } from "../../../ir";
import { buildFn, findAstNode, makeIsolatedHarness, printFn } from "../__testing__/ir";
import { buildIfStatement } from "./buildIfStatement";

function buildIfFromSource(source: string) {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is IfStatement => n.type === "IfStatement",
  );
  const opsBefore = harness.fnBuilder.currentBlock.operations.length;
  const result = buildIfStatement(
    node,
    harness.scope,
    harness.fnBuilder,
    harness.moduleBuilder,
    harness.env,
  );
  const opsAdded = harness.fnBuilder.currentBlock.operations.slice(opsBefore);
  return { harness, opsAdded, result };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildIfStatement — end-to-end smoke", () => {
  it("lowers through the full pipeline", () => {
    const printed = printFn(buildFn("if (c) { a; }"));
    expect(printed).toContain("IfOp");
    expect(printed).toContain("yield");
  });
});

// -----------------------------------------------------------------
// Isolated — shape of the lowered IR
// -----------------------------------------------------------------

describe("buildIfStatement — isolated", () => {
  describe("single-arm (no else)", () => {
    it("emits an IfOp with a synthetic empty alternate region", () => {
      const { opsAdded } = buildIfFromSource("if (c) { a; }");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      expect(ifOp).toBeDefined();

      // Statement-form: no result place.
      expect(ifOp.resultPlaces.length).toBe(0);

      // Both regions present (MLIR `scf.if` requires symmetric arms).
      expect(ifOp.consequentRegion).toBeDefined();
      expect(ifOp.alternateRegion).toBeDefined();

      // Consequent has the body + a YieldOp with no operands.
      const consBlock = ifOp.consequentRegion.entry;
      const consLoadA = consBlock.operations[0] as LoadGlobalOp;
      expect(consLoadA).toBeInstanceOf(LoadGlobalOp);
      expect(consLoadA.name).toBe("a");
      const consYield = consBlock.terminal as YieldOp;
      expect(consYield).toBeInstanceOf(YieldOp);
      expect(consYield.values.length).toBe(0);

      // Alternate is empty — no body, just an empty yield.
      const altBlock = ifOp.alternateRegion!.entry;
      expect(altBlock.operations.length).toBe(0);
      const altYield = altBlock.terminal as YieldOp;
      expect(altYield).toBeInstanceOf(YieldOp);
      expect(altYield.values.length).toBe(0);
    });

    it("works with a non-block body (`if (c) a;`)", () => {
      const { opsAdded } = buildIfFromSource("if (c) a;");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      const consBlock = ifOp.consequentRegion.entry;
      const consLoadA = consBlock.operations[0] as LoadGlobalOp;
      expect(consLoadA.name).toBe("a");
    });
  });

  describe("two-arm (with else)", () => {
    it("emits both arms with their respective bodies", () => {
      const { opsAdded } = buildIfFromSource("if (c) { a; } else { b; }");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;

      const consLoad = ifOp.consequentRegion.entry.operations[0] as LoadGlobalOp;
      expect(consLoad.name).toBe("a");

      const altLoad = ifOp.alternateRegion!.entry.operations[0] as LoadGlobalOp;
      expect(altLoad.name).toBe("b");
    });

    it("works with non-block bodies on both arms", () => {
      const { opsAdded } = buildIfFromSource("if (c) a; else b;");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      const consLoad = ifOp.consequentRegion.entry.operations[0] as LoadGlobalOp;
      const altLoad = ifOp.alternateRegion!.entry.operations[0] as LoadGlobalOp;
      expect(consLoad.name).toBe("a");
      expect(altLoad.name).toBe("b");
    });
  });

  describe("else-if chain", () => {
    it("nests a second IfOp in the outer alternate region", () => {
      const { opsAdded } = buildIfFromSource("if (c) { a; } else if (d) { b; } else { e; }");
      const outerIf = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;

      // Outer consequent loads `a`.
      const outerConsLoad = outerIf.consequentRegion.entry.operations[0] as LoadGlobalOp;
      expect(outerConsLoad.name).toBe("a");

      // Outer alternate contains: LoadGlobal d, IfOp (nested).
      const outerAltBlock = outerIf.alternateRegion!.entry;
      const loadD = outerAltBlock.operations[0] as LoadGlobalOp;
      expect(loadD).toBeInstanceOf(LoadGlobalOp);
      expect(loadD.name).toBe("d");

      const nestedIf = outerAltBlock.operations[1] as IfOp;
      expect(nestedIf).toBeInstanceOf(IfOp);
      expect(nestedIf.test).toBe(loadD.place);

      // Nested consequent loads `b`, nested alternate loads `e`.
      const nestedConsLoad = nestedIf.consequentRegion.entry.operations[0] as LoadGlobalOp;
      const nestedAltLoad = nestedIf.alternateRegion!.entry.operations[0] as LoadGlobalOp;
      expect(nestedConsLoad.name).toBe("b");
      expect(nestedAltLoad.name).toBe("e");
    });
  });

  describe("invariants", () => {
    it("test operand is wired to the condition's sub-build result", () => {
      const { opsAdded } = buildIfFromSource("if (c) { a; }");
      const loadC = opsAdded.find(
        (o): o is LoadGlobalOp => o instanceof LoadGlobalOp && o.name === "c",
      )!;
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      expect(ifOp.test).toBe(loadC.place);
    });

    it("both arms always terminate with YieldOp (MLIR symmetry requirement)", () => {
      // Even the single-arm case synthesizes an empty alternate with
      // just a YieldOp — downstream region-branch analyses expect
      // every structured-op region to terminate.
      for (const src of [
        "if (c) { a; }",
        "if (c) { a; } else { b; }",
        "if (c) a;",
        "if (c) a; else b;",
      ]) {
        const { opsAdded } = buildIfFromSource(src);
        const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
        expect(ifOp.consequentRegion.entry.terminal).toBeInstanceOf(YieldOp);
        expect(ifOp.alternateRegion!.entry.terminal).toBeInstanceOf(YieldOp);
      }
    });

    it("statement-form has empty resultPlaces (no value produced)", () => {
      // Contrast with expression-form IfOps (from buildConditional /
      // buildLogical) which carry exactly one result place.
      for (const src of ["if (c) { a; }", "if (c) { a; } else { b; }"]) {
        const { opsAdded } = buildIfFromSource(src);
        const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
        expect(ifOp.resultPlaces.length).toBe(0);
      }
    });

    it("yield operands are empty (statement form yields void)", () => {
      const { opsAdded } = buildIfFromSource("if (c) { a; } else { b; }");
      const ifOp = opsAdded.find((o): o is IfOp => o instanceof IfOp)!;
      const consYield = ifOp.consequentRegion.entry.terminal as YieldOp;
      const altYield = ifOp.alternateRegion!.entry.terminal as YieldOp;
      expect(consYield.values.length).toBe(0);
      expect(altYield.values.length).toBe(0);
    });

    it("builder returns undefined (statement, no value)", () => {
      const { result } = buildIfFromSource("if (c) { a; }");
      expect(result).toBeUndefined();
    });
  });
});
