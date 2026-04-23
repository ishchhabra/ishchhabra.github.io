import { describe, expect, it } from "vitest";
import type { AssignmentExpression, Node } from "oxc-parser";
import {
  ArrayDestructureOp,
  BinaryExpressionOp,
  IfTermOp,
  JumpTermOp,
  LiteralOp,
  LoadStaticPropertyOp,
  ObjectDestructureOp,
  StoreDynamicPropertyOp,
  StoreLocalOp,
  StoreStaticPropertyOp,
  UnaryExpressionOp,
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
      const binary = opsAdded.find((o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp);
      // The hoisted `let x = 1;` initializer emits its own StoreLocal
      // before the compound assignment's store; take the last one.
      const store = opsAdded.findLast((o): o is StoreLocalOp => o instanceof StoreLocalOp);
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
      const binary = opsAdded.find((o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp);
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
      const binary = opsAdded.find((o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp);
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
      const store = opsAdded.find((o): o is StoreLocalOp => o instanceof StoreLocalOp)!;
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

// -----------------------------------------------------------------
// Isolated — logical assignments (||=, &&=, ??=)
//
// Logical assignments pivot the CFG like `buildLogicalExpression`:
// an IfTermOp with a consBlock (evaluates RHS + stores) and an altBlock
// (passthrough old value). The test harness snapshots the parent
// block before the build call so we can locate the IfTermOp after
// currentBlock has moved to the join block.
// -----------------------------------------------------------------

function buildLogicalAssignFromSource(source: string): {
  harness: ReturnType<typeof makeIsolatedHarness>;
  parentBlock: import("../../../ir").BasicBlock;
  term: IfTermOp;
} {
  const harness = makeIsolatedHarness(source);
  primeAllBindingsInitialized(harness);
  const node = findAstNode(
    harness.program,
    (n: Node): n is AssignmentExpression => n.type === "AssignmentExpression",
  );
  const parentBlockId = harness.fnBuilder.currentBlock.id;
  buildAssignmentExpression(
    node,
    harness.scope,
    harness.fnBuilder,
    harness.moduleBuilder,
    harness.env,
  );
  const parentBlock = [...harness.fnBuilder.bodyRegion.allBlocks()].find(
    (b) => b.id === parentBlockId,
  );
  if (!parentBlock) throw new Error("parent block missing");
  const term = parentBlock.terminal;
  if (!(term instanceof IfTermOp)) {
    throw new Error(`expected IfTermOp terminal, got ${term?.constructor.name}`);
  }
  return { harness, parentBlock, term };
}

describe("buildAssignmentExpression — logical identifier assignments", () => {
  describe("CFG shape (shared across ||=, &&=, ??=)", () => {
    it.each(["||=", "&&=", "??="] as const)(
      "`x %s y` produces an IfTermOp with three distinct successor blocks",
      (op) => {
        const { term } = buildLogicalAssignFromSource(`let x = 1; x ${op} 2;`);
        expect(term).toBeInstanceOf(IfTermOp);
        expect(term.thenBlock).not.toBe(term.elseBlock);
        expect(term.thenBlock).not.toBe(term.fallthroughBlock);
        expect(term.elseBlock).not.toBe(term.fallthroughBlock);
      },
    );

    it.each(["||=", "&&=", "??="] as const)(
      "`x %s y` join block has exactly one block parameter",
      (op) => {
        const { term } = buildLogicalAssignFromSource(`let x = 1; x ${op} 2;`);
        expect(term.fallthroughBlock.params.length).toBe(1);
      },
    );

    it.each(["||=", "&&=", "??="] as const)(
      "`x %s y` both arms jump to the join block",
      (op) => {
        const { term } = buildLogicalAssignFromSource(`let x = 1; x ${op} 2;`);
        const thenJump = term.thenBlock.terminal;
        const elseJump = term.elseBlock.terminal;
        expect(thenJump).toBeInstanceOf(JumpTermOp);
        expect(elseJump).toBeInstanceOf(JumpTermOp);
        expect((thenJump as JumpTermOp).target).toBe(term.fallthroughBlock);
        expect((elseJump as JumpTermOp).target).toBe(term.fallthroughBlock);
      },
    );

    it.each(["||=", "&&=", "??="] as const)(
      "`x %s y` leaves currentBlock set to the join block",
      (op) => {
        const { harness, term } = buildLogicalAssignFromSource(`let x = 1; x ${op} 2;`);
        expect(harness.fnBuilder.currentBlock).toBe(term.fallthroughBlock);
      },
    );
  });

  describe("||= condition — `!oldValue`", () => {
    it("emits a UnaryExpression `!` on the old value as the test", () => {
      const { parentBlock, term } = buildLogicalAssignFromSource("let x = 1; x ||= 2;");
      const unary = parentBlock.operations.findLast(
        (o): o is UnaryExpressionOp => o instanceof UnaryExpressionOp,
      );
      expect(unary).toBeDefined();
      expect(unary!.operator).toBe("!");
      expect(term.cond).toBe(unary!.place);
    });
  });

  describe("&&= condition — old value directly", () => {
    it("emits no wrapper op — no UnaryExpression, no `==` against null", () => {
      const { parentBlock } = buildLogicalAssignFromSource("let x = 1; x &&= 2;");
      const unary = parentBlock.operations.find((o) => o instanceof UnaryExpressionOp);
      const nullishBinary = parentBlock.operations.find(
        (o) => o instanceof BinaryExpressionOp && o.operator === "==",
      );
      expect(unary).toBeUndefined();
      expect(nullishBinary).toBeUndefined();
    });

    it("passes the same value to IfTermOp.cond and the passthrough-arm jump", () => {
      // For &&=, the condition is the old value itself (no wrapper), and
      // the else-arm also forwards the old value. They must be identical.
      const { term } = buildLogicalAssignFromSource("let x = 1; x &&= 2;");
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(term.cond).toBe(args[0]);
    });
  });

  describe("??= condition — `oldValue == null` (loose)", () => {
    it("emits `oldValue == null` (not `===`) so undefined is caught", () => {
      const { parentBlock, term } = buildLogicalAssignFromSource("let x = 1; x ??= 2;");
      const binary = parentBlock.operations.findLast(
        (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp,
      );
      expect(binary).toBeDefined();
      // LOOSE `==` is mandatory: `==` is true for both null and undefined;
      // strict `===` would leave `undefined ??= 2` broken.
      expect(binary!.operator).toBe("==");
      const literal = parentBlock.operations.findLast(
        (o): o is LiteralOp => o instanceof LiteralOp,
      );
      expect(literal).toBeDefined();
      expect(literal!.value).toBe(null);
      expect(term.cond).toBe(binary!.place);
    });
  });

  describe("arm semantics", () => {
    it("truthy arm (consBlock) evaluates RHS and stores; jump carries stored value", () => {
      const { term } = buildLogicalAssignFromSource("let x = 1; x ||= 2;");
      // The consBlock evaluates RHS (LiteralOp 2) and emits a StoreLocalOp.
      const store = term.thenBlock.operations.findLast(
        (o): o is StoreLocalOp => o instanceof StoreLocalOp,
      );
      expect(store).toBeDefined();
      expect(store!.kind).toBe("assignment");
      // The jump carries a single arg — the stabilized RHS value.
      const args = (term.thenBlock.terminal as JumpTermOp).args;
      expect(args.length).toBe(1);
    });

    it("falsy arm (altBlock) is a passthrough — no ops, jumps with old value", () => {
      const { term } = buildLogicalAssignFromSource("let x = 1; x ||= 2;");
      expect(term.elseBlock.operations.length).toBe(0);
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(args.length).toBe(1);
    });

    it("`x ||= y` passthrough arg equals the `!` unary's operand (same oldValue)", () => {
      const { parentBlock, term } = buildLogicalAssignFromSource("let x = 1; x ||= 2;");
      const unary = parentBlock.operations.findLast(
        (o): o is UnaryExpressionOp => o instanceof UnaryExpressionOp,
      )!;
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      // `!oldValue` takes oldValue as its only operand; that same oldValue
      // is forwarded by the passthrough arm.
      expect(args[0]).toBe(unary.argument);
    });

    it("`x ??= y` passthrough arg equals the `==` binary's left operand (same oldValue)", () => {
      const { parentBlock, term } = buildLogicalAssignFromSource("let x = 1; x ??= 2;");
      const binary = parentBlock.operations.findLast(
        (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp && o.operator === "==",
      )!;
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(args[0]).toBe(binary.left);
    });
  });
});

// -----------------------------------------------------------------
// Isolated — logical member assignments (obj.x ||= / &&= / ??=)
//
// Member logical assignments must fire the getter exactly once: the
// property read is cached in the parent block, then used both as the
// condition-operand and as the altBlock's passthrough value.
// -----------------------------------------------------------------

describe("buildAssignmentExpression — logical member assignments", () => {
  it.each(["||=", "&&=", "??="] as const)(
    "`obj.x %s y` loads obj.x exactly once (getter fires once)",
    (op) => {
      const { parentBlock } = buildLogicalAssignFromSource(`obj.x ${op} 2;`);
      const loads = parentBlock.operations.filter(
        (o) => o instanceof LoadStaticPropertyOp,
      );
      expect(loads.length).toBe(1);
    },
  );

  it.each(["||=", "&&=", "??="] as const)(
    "`obj.x %s y` passthrough arm forwards the cached load — not a second read",
    (op) => {
      const { parentBlock, term } = buildLogicalAssignFromSource(`obj.x ${op} 2;`);
      const cachedLoad = parentBlock.operations.find(
        (o): o is LoadStaticPropertyOp => o instanceof LoadStaticPropertyOp,
      )!;
      // No additional LoadStaticPropertyOp inside either arm.
      expect(
        term.elseBlock.operations.some((o) => o instanceof LoadStaticPropertyOp),
      ).toBe(false);
      const args = (term.elseBlock.terminal as JumpTermOp).args;
      expect(args[0]).toBe(cachedLoad.place);
    },
  );

  it("`obj.x ??= y` uses loose `==` null (not `===`)", () => {
    const { parentBlock, term } = buildLogicalAssignFromSource("obj.x ??= 2;");
    const binary = parentBlock.operations.findLast(
      (o): o is BinaryExpressionOp => o instanceof BinaryExpressionOp,
    )!;
    expect(binary.operator).toBe("==");
    expect(term.cond).toBe(binary.place);
  });

  it("`obj.x ||= y` truthy arm stores into the property", () => {
    const { term } = buildLogicalAssignFromSource("obj.x ||= 2;");
    const store = term.thenBlock.operations.findLast(
      (o): o is StoreStaticPropertyOp => o instanceof StoreStaticPropertyOp,
    );
    expect(store).toBeDefined();
    expect(store!.property).toBe("x");
  });
});
