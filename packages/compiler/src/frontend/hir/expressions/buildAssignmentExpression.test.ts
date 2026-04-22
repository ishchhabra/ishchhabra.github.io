import { describe, expect, it } from "vitest";
import type { AssignmentExpression, Node } from "oxc-parser";
import {
  ArrayDestructureOp,
  BinaryExpressionOp,
  ObjectDestructureOp,
  StoreDynamicPropertyOp,
  StoreLocalOp,
  StoreStaticPropertyOp,
} from "../../../ir";
import {
  buildFn,
  findAstNode,
  makeIsolatedHarness,
  primeAllBindingsInitialized,
  printFn,
} from "../__testing__/ir";
import { buildAssignmentExpression } from "./buildAssignmentExpression";

function buildAssignFromSource(source: string) {
  const harness = makeIsolatedHarness(source);
  // Exit TDZ so `let x; x = 1;` doesn't throw — we're testing the
  // assignment builder, not TDZ semantics.
  primeAllBindingsInitialized(harness);
  const node = findAstNode(
    harness.program,
    (n: Node): n is AssignmentExpression => n.type === "AssignmentExpression",
  );
  const opsBefore = harness.fnBuilder.currentBlock.operations.length;
  buildAssignmentExpression(
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
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildAssignmentExpression — end-to-end smoke", () => {
  it("simple identifier assignment", () => {
    expect(printFn(buildFn("let x; x = 1;"))).toContain("{kind = assignment}");
  });
});

// -----------------------------------------------------------------
// Isolated — assignment expressions
//
// Note: the isolated harness runs `instantiateScopeBindings`, which
// emits declaration-form stores for every declared binding in the
// program (e.g. `let x;` → `LoadGlobal undefined; store_local {kind =
// declaration}`). The helper slices ops added *after* the build call
// so assertions focus on the AssignmentExpression's output alone.
// -----------------------------------------------------------------

describe("buildAssignmentExpression — isolated", () => {
  describe("identifier LHS", () => {
    it("`x = 1` emits assignment-kind store_local", () => {
      const { opsAdded } = buildAssignFromSource("let x; x = 1;");
      const last = opsAdded[opsAdded.length - 1];
      expect(last).toBeInstanceOf(StoreLocalOp);
      const store = last as StoreLocalOp;
      expect(store.kind).toBe("assignment");
      // `StoreLocalOp.type` on assignment-form is always `"const"` for
      // locals (`"let"` for context vars), regardless of the original
      // declaration's kind. The source-of-truth for syntactic kind is
      // `DeclarationMetadata.kind` — see TODO.local.md for removal.
      expect(store.type).toBe("const");
    });

    it("compound `x += 2` emits Binary + StoreLocal(assignment)", () => {
      const { opsAdded } = buildAssignFromSource("let x = 1; x += 2;");
      const binary = opsAdded.find(
        (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp,
      );
      // The hoisted `let x = 1;` initializer emits its own StoreLocal
      // before the compound assignment's store; take the last one.
      const store = opsAdded.findLast(
        (o): o is StoreLocalOp => o instanceof StoreLocalOp,
      );
      expect(binary).toBeDefined();
      expect(binary!.operator).toBe("+");
      expect(store).toBeDefined();
      expect(store!.kind).toBe("assignment");
    });

    it.each([
      ["+=", "+"],
      ["-=", "-"],
      ["*=", "*"],
      ["/=", "/"],
      ["%=", "%"],
      ["**=", "**"],
      ["|=", "|"],
      ["&=", "&"],
      ["^=", "^"],
      ["<<=", "<<"],
      [">>=", ">>"],
      [">>>=", ">>>"],
    ] as const)("compound `%s` lowers to binary `%s` + store", (op, binop) => {
      const { opsAdded } = buildAssignFromSource(`let x = 1; x ${op} 2;`);
      const binary = opsAdded.find(
        (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp,
      );
      expect(binary).toBeDefined();
      expect(binary!.operator).toBe(binop);
    });
  });

  describe("member LHS", () => {
    it("`obj.x = 1` emits store_static_property", () => {
      const { opsAdded } = buildAssignFromSource("obj.x = 1;");
      const store = opsAdded.find(
        (o): o is StoreStaticPropertyOp => o instanceof StoreStaticPropertyOp,
      );
      expect(store).toBeDefined();
      expect(store!.property).toBe("x");
    });

    it("`obj[k] = 1` emits store_dynamic_property", () => {
      const { opsAdded } = buildAssignFromSource("obj[k] = 1;");
      const store = opsAdded.find(
        (o): o is StoreDynamicPropertyOp => o instanceof StoreDynamicPropertyOp,
      );
      expect(store).toBeDefined();
    });

    it("`obj[0] = 1` folds numeric-literal key to a static store", () => {
      const { opsAdded } = buildAssignFromSource("obj[0] = 1;");
      const store = opsAdded.find(
        (o): o is StoreStaticPropertyOp => o instanceof StoreStaticPropertyOp,
      );
      expect(store).toBeDefined();
      expect(store!.property).toBe("0");
    });

    it("compound `obj.x += 1` lowers to Load + Binary + StoreStaticProperty", () => {
      const { opsAdded } = buildAssignFromSource("obj.x += 1;");
      const loads = opsAdded.filter((o) => o.constructor.name === "LoadStaticPropertyOp");
      const binary = opsAdded.find(
        (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp,
      );
      const store = opsAdded.find(
        (o): o is StoreStaticPropertyOp => o instanceof StoreStaticPropertyOp,
      );
      expect(loads.length).toBeGreaterThanOrEqual(1);
      expect(binary).toBeDefined();
      expect(binary!.operator).toBe("+");
      expect(store).toBeDefined();
    });
  });

  describe("pattern LHS", () => {
    it("`[a, b] = arr` emits assignment-kind array_destructure", () => {
      const { opsAdded } = buildAssignFromSource("let a, b; [a, b] = arr;");
      const destructure = opsAdded.find(
        (o): o is ArrayDestructureOp => o instanceof ArrayDestructureOp,
      );
      expect(destructure).toBeDefined();
      expect(destructure!.kind).toBe("assignment");
    });

    it("`({x, y} = obj)` emits assignment-kind object_destructure", () => {
      const { opsAdded } = buildAssignFromSource("let x, y; ({x, y} = obj);");
      const destructure = opsAdded.find(
        (o): o is ObjectDestructureOp => o instanceof ObjectDestructureOp,
      );
      expect(destructure).toBeDefined();
      expect(destructure!.kind).toBe("assignment");
    });
  });

  describe("semantics", () => {
    it("StoreLocal for assignment reports side effects", () => {
      const { opsAdded } = buildAssignFromSource("let x; x = 1;");
      const store = opsAdded.find(
        (o): o is StoreLocalOp => o instanceof StoreLocalOp,
      )!;
      expect(store.hasSideEffects()).toBe(true);
    });

    it("StoreStaticProperty reports side effects", () => {
      const { opsAdded } = buildAssignFromSource("obj.x = 1;");
      const store = opsAdded.find(
        (o): o is StoreStaticPropertyOp => o instanceof StoreStaticPropertyOp,
      )!;
      expect(store.hasSideEffects()).toBe(true);
    });

    it("StoreDynamicProperty reports side effects", () => {
      const { opsAdded } = buildAssignFromSource("obj[k] = 1;");
      const store = opsAdded.find(
        (o): o is StoreDynamicPropertyOp => o instanceof StoreDynamicPropertyOp,
      )!;
      expect(store.hasSideEffects()).toBe(true);
    });
  });
});
