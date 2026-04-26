import { describe, expect, it } from "vitest";
import type { Node } from "oxc-parser";
import { LoadGlobalOp, LoadLocalOp } from "../../ir";
import {
  buildFn,
  makeIsolatedHarness,
  primeAllBindingsInitialized,
  printFn,
} from "./__testing__/ir";
import { buildIdentifier } from "./buildIdentifier";

type IdentifierNode = Node & { type: "Identifier"; name: string };

/**
 * Find the last `Identifier` node in the program in source order. The
 * last Identifier is the reference-position one — binding-position
 * identifiers (`let <x>` = ..., the lhs) appear earlier.
 */
function findLastIdentifier(program: Node): IdentifierNode {
  let last: IdentifierNode | undefined;
  const visit = (n: Node): void => {
    if (n.type === "Identifier") last = n as IdentifierNode;
    for (const key in n) {
      const v = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const c of v) if (isNode(c)) visit(c);
      } else if (isNode(v)) {
        visit(v);
      }
    }
  };
  visit(program);
  if (last === undefined) throw new Error("no Identifier in program");
  return last;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function buildIdentFromSource(source: string, options: { prime?: boolean } = {}) {
  const harness = makeIsolatedHarness(source);
  if (options.prime !== false) primeAllBindingsInitialized(harness);
  const node = findLastIdentifier(harness.program);
  const opsBefore = harness.fnBuilder.currentBlock.operations.length;
  const place = buildIdentifier(node, harness.scope, harness.fnBuilder, harness.env);
  const opsAdded = harness.fnBuilder.currentBlock.operations.slice(opsBefore);
  return { harness, place, opsAdded };
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildIdentifier — end-to-end smoke", () => {
  it("undeclared identifier emits LoadGlobal", () => {
    expect(printFn(buildFn("x;"))).toContain("LoadGlobal x");
  });

  it("declared local emits LoadLocal", () => {
    expect(printFn(buildFn("let x = 1; x;"))).toContain("LoadLocal");
  });
});

// -----------------------------------------------------------------
// Isolated — dispatch paths
// -----------------------------------------------------------------

describe("buildIdentifier — isolated", () => {
  describe("LoadGlobal path", () => {
    it("undeclared identifier resolves to LoadGlobal", () => {
      const { place, opsAdded } = buildIdentFromSource("x;");
      expect(opsAdded.length).toBe(1);
      const op = opsAdded[0];
      expect(op).toBeInstanceOf(LoadGlobalOp);
      expect((op as LoadGlobalOp).name).toBe("x");
      expect(place).toBe(op.place);
    });

    it("imported identifier resolves to LoadGlobal (imports are treated as globals)", () => {
      const { opsAdded } = buildIdentFromSource("import { x } from 'mod'; x;");
      // Imports produce some module-level ops ahead of the reference;
      // the last op added by `buildIdentifier` is the LoadGlobal itself.
      const loadGlobal = opsAdded.findLast((o): o is LoadGlobalOp => o instanceof LoadGlobalOp);
      expect(loadGlobal).toBeDefined();
      expect(loadGlobal!.name).toBe("x");
    });
  });

  describe("LoadLocal path", () => {
    it("declared local (var) resolves to LoadLocal", () => {
      const { place, opsAdded } = buildIdentFromSource("var x; x;");
      const load = opsAdded.findLast((o): o is LoadLocalOp => o instanceof LoadLocalOp);
      expect(load).toBeDefined();
      expect(place).toBe(load!.place);
    });

    it("declared local (let) resolves to LoadLocal after priming", () => {
      const { opsAdded } = buildIdentFromSource("let x = 1; x;");
      const load = opsAdded.findLast((o): o is LoadLocalOp => o instanceof LoadLocalOp);
      expect(load).toBeDefined();
    });

    it("declared local (const) resolves to LoadLocal after priming", () => {
      const { opsAdded } = buildIdentFromSource("const x = 1; x;");
      const load = opsAdded.findLast((o): o is LoadLocalOp => o instanceof LoadLocalOp);
      expect(load).toBeDefined();
    });
  });

  describe("TDZ path", () => {
    // The harness's `primeAllBindingsInitialized` is opt-in. Skip it
    // here to exercise the TDZ-aware code path — reading a `let` /
    // `const` binding that hasn't been initialized must throw.

    it("reading a `let` in its TDZ throws", () => {
      expect(() => buildIdentFromSource("let x; x;", { prime: false })).toThrow(
        /Cannot access 'x' before initialization/,
      );
    });

    it("reading a `const` in its TDZ throws", () => {
      // `const` must have an initializer syntactically. To land on the
      // TDZ-throw path, we use a pattern where the reference precedes
      // the declarator — function-hoisting context.
      expect(() =>
        buildIdentFromSource("function f() { return x; const x = 1; } f();", {
          prime: false,
        }),
      ).toThrow(/Cannot access 'x' before initialization/);
    });

    it("`var` has no TDZ — reading before init is fine", () => {
      // `var` bindings initialize to `undefined` at function entry (hoisted),
      // so no TDZ window. No priming needed.
      expect(() => buildIdentFromSource("var x; x;", { prime: false })).not.toThrow();
    });
  });

  describe("invariants", () => {
    it("creates a fresh SSA Value for each read (not a new version of the binding)", () => {
      // Two reads of the same `let` produce two distinct places, each a
      // LoadLocal op. This matters so SSA rename stacks don't confuse
      // reads with writes.
      const harness = makeIsolatedHarness("let x = 1; x; x;");
      primeAllBindingsInitialized(harness);
      const refs: IdentifierNode[] = [];
      const visit = (n: Node): void => {
        if (n.type === "Identifier" && (n as IdentifierNode).name === "x") {
          refs.push(n as IdentifierNode);
        }
        for (const key in n) {
          const v = (n as unknown as Record<string, unknown>)[key];
          if (Array.isArray(v)) {
            for (const c of v) if (isNode(c)) visit(c);
          } else if (isNode(v)) {
            visit(v);
          }
        }
      };
      visit(harness.program);
      const refNodes = refs.slice(1); // skip the declaration's binding identifier
      expect(refNodes.length).toBe(2);

      const p1 = buildIdentifier(refNodes[0], harness.scope, harness.fnBuilder, harness.env);
      const p2 = buildIdentifier(refNodes[1], harness.scope, harness.fnBuilder, harness.env);
      expect(p1).not.toBe(p2);
    });

    it("LoadLocal exposes the five-axis effects model", () => {
      const { opsAdded } = buildIdentFromSource("let x = 1; x;");
      const load = opsAdded.findLast((o): o is LoadLocalOp => o instanceof LoadLocalOp)!;
      // LoadLocal reads a binding cell — non-empty reads block
      // duplication, but it's still DCE-removable.
      expect(load.getMemoryEffects().reads.length).toBeGreaterThan(0);
      expect(load.mayThrow()).toBe(false);
      expect(load.isObservable()).toBe(false);
    });
  });
});
