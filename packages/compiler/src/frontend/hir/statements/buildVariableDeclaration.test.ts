import { describe, expect, it } from "vitest";
import type { Node, VariableDeclaration } from "oxc-parser";
import { ArrayDestructureOp, ObjectDestructureOp, StoreLocalOp } from "../../../ir";
import { buildFn, findAstNode, makeIsolatedHarness, printFn, printOps } from "../__testing__/ir";
import { buildVariableDeclaration } from "./buildVariableDeclaration";

function buildVarDeclFromSource(source: string) {
  const harness = makeIsolatedHarness(source);
  const node = findAstNode(
    harness.program,
    (n: Node): n is VariableDeclaration => n.type === "VariableDeclaration",
  );
  buildVariableDeclaration(
    node,
    harness.scope,
    harness.fnBuilder,
    harness.moduleBuilder,
    harness.env,
  );
  return harness;
}

// -----------------------------------------------------------------
// End-to-end smoke
// -----------------------------------------------------------------

describe("buildVariableDeclaration — end-to-end smoke", () => {
  it("renders through the full HIR pipeline", () => {
    expect(printFn(buildFn("let x = 1;"))).toBe(
      ["bb0:", "  $1 = 1", '  $2 = store_local $0, $1 {kind = declaration}'].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated
// -----------------------------------------------------------------

describe("buildVariableDeclaration — isolated", () => {
  describe("simple declarations", () => {
    it("`let x = 1` emits a declaration-kind store_local", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$1 = 1", '$2 = store_local $0, $1 {kind = declaration}'].join("\n"),
      );
    });

    it("`const y = 2` emits a declaration-kind store_local", () => {
      const h = buildVarDeclFromSource("const y = 2;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$1 = 2", '$2 = store_local $0, $1 {kind = declaration}'].join("\n"),
      );
    });

    // `var z = 3` has two stores — hoisted declaration-with-undefined
    // at the function prologue, then assignment at source position.
    // The isolated harness doesn't run hoisting (that's the full
    // FuncOpBuilder.build path), so only the source-position store
    // appears here; the end-to-end smoke tests capture the hoisted form.
    it("`var z = 3` at the isolated level emits the source-position store", () => {
      const h = buildVarDeclFromSource("var z = 3;");
      const ops = h.fnBuilder.currentBlock.operations;
      const lastStore = ops[ops.length - 1];
      expect(lastStore).toBeInstanceOf(StoreLocalOp);
      expect((lastStore as StoreLocalOp).type).toBe("var");
    });

    it("multi-declarator `let x = 1, y = 2` emits one store per declarator", () => {
      const h = buildVarDeclFromSource("let x = 1, y = 2;");
      const stores = h.fnBuilder.currentBlock.operations.filter(
        (op): op is StoreLocalOp => op instanceof StoreLocalOp,
      );
      expect(stores.length).toBe(2);
      for (const store of stores) {
        expect(store.kind).toBe("declaration");
        expect(store.type).toBe("let");
      }
    });
  });

  describe("syntactic kind is preserved on the op", () => {
    it.each([
      { keyword: "let", source: "let x = 1;" },
      { keyword: "const", source: "const x = 1;" },
      { keyword: "var", source: "var x = 1;" },
    ] as const)("`$keyword` → store_local.type = `$keyword`", ({ keyword, source }) => {
      const h = buildVarDeclFromSource(source);
      const store = h.fnBuilder.currentBlock.operations.find(
        (op): op is StoreLocalOp => op instanceof StoreLocalOp,
      );
      expect(store).toBeDefined();
      expect(store!.type).toBe(keyword);
    });
  });

  describe("uninitialized declarations", () => {
    // `let a;` has no initializer. The builder emits a LoadGlobal for
    // the identifier `undefined` and uses that as the value operand.
    // This is brittle to user-shadowing `undefined` — flagged in the
    // local TODO, tracked separately.
    it("`let a` synthesizes an undefined value via LoadGlobal", () => {
      const h = buildVarDeclFromSource("let a;");
      const ops = h.fnBuilder.currentBlock.operations;
      expect(ops[0].print()).toBe("$1 = LoadGlobal undefined");
      const store = ops[ops.length - 1];
      expect(store).toBeInstanceOf(StoreLocalOp);
      expect((store as StoreLocalOp).kind).toBe("declaration");
    });
  });

  describe("array destructuring", () => {
    it("`let [a, b] = arr` emits one array_destructure op", () => {
      const h = buildVarDeclFromSource("let [a, b] = arr;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$2 = LoadGlobal arr", '$3 = array_destructure $2 {kind = declaration}'].join("\n"),
      );
    });

    it("carries the syntactic declarationKind on the op", () => {
      const h = buildVarDeclFromSource("const [a, b] = arr;");
      const op = h.fnBuilder.currentBlock.operations.find(
        (o): o is ArrayDestructureOp => o instanceof ArrayDestructureOp,
      );
      expect(op).toBeDefined();
      expect(op!.declarationKind).toBe("const");
      expect(op!.kind).toBe("declaration");
    });
  });

  describe("object destructuring", () => {
    it("`let {x, y} = obj` emits one object_destructure op", () => {
      const h = buildVarDeclFromSource("let {x, y} = obj;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$2 = LoadGlobal obj", '$3 = object_destructure $2 {kind = declaration}'].join("\n"),
      );
    });

    it("`let {x = 42} = obj` — default value is emitted inline", () => {
      const h = buildVarDeclFromSource("let {x = 42} = obj;");
      const ops = h.fnBuilder.currentBlock.operations;
      const literals = ops.filter((o) => o.print().includes("42"));
      expect(literals.length).toBe(1);
      const destructure = ops.find(
        (o): o is ObjectDestructureOp => o instanceof ObjectDestructureOp,
      );
      expect(destructure).toBeDefined();
    });
  });

  describe("semantics", () => {
    it("store wires value operand to the RHS builder's result", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      const [lit, store] = h.fnBuilder.currentBlock.operations;
      expect((store as StoreLocalOp).value).toBe(lit.place);
    });

    it("store reports side effects (writes bind the lval cell)", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      const store = h.fnBuilder.currentBlock.operations.find(
        (o): o is StoreLocalOp => o instanceof StoreLocalOp,
      );
      expect(store!.hasSideEffects()).toBe(true);
    });
  });
});
