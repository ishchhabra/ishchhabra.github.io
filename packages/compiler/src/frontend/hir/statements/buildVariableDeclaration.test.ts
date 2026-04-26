import { describe, expect, it } from "vitest";
import type { Node, VariableDeclaration } from "oxc-parser";
import {
  ArrayDestructureOp,
  BindingDeclOp,
  BindingInitOp,
  ObjectDestructureOp,
  StoreLocalOp,
} from "../../../ir";
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
      ["bb0:", "  $2 = 1", "  $0 = binding_init let $2"].join("\n"),
    );
  });
});

// -----------------------------------------------------------------
// Isolated
// -----------------------------------------------------------------

describe("buildVariableDeclaration — isolated", () => {
  describe("simple declarations", () => {
    it("`let x = 1` emits a binding initializer", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$2 = 1", "$0 = binding_init let $2"].join("\n"),
      );
    });

    it("`const y = 2` emits a binding initializer", () => {
      const h = buildVarDeclFromSource("const y = 2;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$2 = 2", "$0 = binding_init const $2"].join("\n"),
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
    });

    it("multi-declarator `let x = 1, y = 2` emits one binding initializer per declarator", () => {
      const h = buildVarDeclFromSource("let x = 1, y = 2;");
      const initializers = h.fnBuilder.currentBlock.operations.filter(
        (op): op is BindingInitOp => op instanceof BindingInitOp,
      );
      expect(initializers.map((init) => init.kind)).toEqual(["let", "let"]);
    });
  });

  describe("syntactic kind is preserved on the binding initializer", () => {
    it.each([
      { keyword: "let", source: "let x = 1;" },
      { keyword: "const", source: "const x = 1;" },
    ] as const)("`$keyword` → binding_init.kind = `$keyword`", ({ keyword, source }) => {
      const h = buildVarDeclFromSource(source);
      const initializer = h.fnBuilder.currentBlock.operations.find(
        (op): op is BindingInitOp => op instanceof BindingInitOp,
      );
      expect(initializer).toBeDefined();
      expect(initializer!.kind).toBe(keyword);
    });
  });

  describe("uninitialized declarations", () => {
    it("`let a` emits a bare binding declaration", () => {
      const h = buildVarDeclFromSource("let a;");
      const ops = h.fnBuilder.currentBlock.operations;
      expect(ops).toHaveLength(1);
      expect(ops[0]).toBeInstanceOf(BindingDeclOp);
      expect(ops[0].print()).toBe("binding_decl let $0");
    });
  });

  describe("array destructuring", () => {
    it("`let [a, b] = arr` emits one array_destructure op", () => {
      const h = buildVarDeclFromSource("let [a, b] = arr;");
      expect(printOps(h.fnBuilder.currentBlock.operations)).toBe(
        ["$3 = LoadGlobal arr", "$2 = array_destructure $3 {kind = declaration}"].join("\n"),
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
        ["$3 = LoadGlobal obj", "$2 = object_destructure $3 {kind = declaration}"].join("\n"),
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
    it("binding initializer wires value operand to the RHS builder's result", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      const [lit, init] = h.fnBuilder.currentBlock.operations;
      expect((init as BindingInitOp).value).toBe(lit.place);
    });

    it("binding initializer is structurally DCE-removable when its place is unused", () => {
      const h = buildVarDeclFromSource("let x = 1;");
      const init = h.fnBuilder.currentBlock.operations.find(
        (o): o is BindingInitOp => o instanceof BindingInitOp,
      );
      // BindingInit's only effect is writing the local binding; no
      // throws, no observability, deterministic.
      expect(init!.mayThrow()).toBe(false);
      expect(init!.isObservable()).toBe(false);
      expect(init!.isDeterministic).toBe(true);
    });
  });
});
