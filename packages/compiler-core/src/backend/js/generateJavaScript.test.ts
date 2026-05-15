import { describe, expect, it } from "vitest";

import { ModuleIRBuilder } from "../../frontend/ModuleIRBuilder";
import { parseModule } from "../../frontend/parse/parseModule";
import { AnalysisManager } from "../../ir/analysis";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { createCopyPropagationPass } from "../../ir/passes/CopyPropagationPass";
import { FunctionPassManager } from "../../ir/passes/PassManager";
import { createValueMaterializationPass } from "../../ir/passes/ValueMaterializationPass";
import { generateJavaScript } from "./generateJavaScript";

describe("generateJavaScript", () => {
  it("emits a minimal module from lowered IR", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1 + 2; x;"),
    );

    expect(generateJavaScript(input)).toBe("let x = 1 + 2;");
  });

  it("emits an unused call as an expression statement", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "foo();"),
    );

    expect(generateJavaScript(input)).toBe("foo();");
  });

  it("does not emit nested calls twice", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "bar(foo());"),
    );

    expect(generateJavaScript(input)).toBe("bar(foo());");
  });

  it("emits static member calls without losing the receiver", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.method();"),
    );

    expect(generateJavaScript(input)).toBe("obj.method();");
  });

  it("emits computed member calls without losing the receiver", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key]();"),
    );

    expect(generateJavaScript(input)).toBe("obj[key]();");
  });

  it("emits spread call arguments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "fn(a, ...rest);"),
    );

    expect(generateJavaScript(input)).toBe("fn(a, ...rest);");
  });

  it("emits function expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function g() { return 1; };"),
    );

    expect(generateJavaScript(input)).toBe("const f = function g() {\n  return 1;\n};");
  });

  it("emits async generator function expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async function* () {};"),
    );

    expect(generateJavaScript(input)).toBe("const f = async function* () {};");
  });

  it("emits arrow function expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async () => 1;"),
    );

    expect(generateJavaScript(input)).toBe("const f = async () => {\n  return 1;\n};");
  });

  it("emits default, rest, and destructured function parameters", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f(x = 1, { y }, ...rest) { return y; }"),
    );

    expect(generateJavaScript(input)).toBe("function f(x = 1, { y }, ...rest) {\n  return y;\n}");
  });

  it("emits class declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { return 1; } }"),
    );

    expect(generateJavaScript(input)).toBe(
      "class C extends Base {\n  method() {\n    return 1;\n  }\n}",
    );
  });

  it("emits class expressions with constructors, static methods, and accessors", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "const C = class { constructor() {} static create() {} get value() { return 1; } set value(next) {} };",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "const C = class {\n  constructor() {}\n  static create() {}\n\n  get value() {\n    return 1;\n  }\n\n  set value(next) {}\n};",
    );
  });

  it("emits super constructor calls, property reads, and method calls", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "class C extends Base { constructor(value) { super(value); } get value() { return super.value; } method() { return super.m(1); } }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "class C extends Base {\n  constructor(value) {\n    super(value);\n  }\n\n  get value() {\n    return super.value;\n  }\n\n  method() {\n    return super.m(1);\n  }\n}",
    );
  });

  it("emits public class fields", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { x = 1; y; static count = 0; }"),
    );

    expect(generateJavaScript(input)).toBe("class C {\n  x = 1;\n  y;\n  static count = 0;\n}");
  });

  it("emits super property writes", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "class C extends Base { method() { super.x = 1; super.x += 2; super.x++; } }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "class C extends Base {\n  method() {\n    super.x = 1;\n    super.x = super.x + 2;\n    super.x = super.x + 1;\n  }\n}",
    );
  });

  it("emits private class elements and private member operations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "class C { #x = 1; #m() { return this.#x; } method(other) { this.#x = other.#m(); return #x in other; } }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "class C {\n  #x = 1;\n\n  #m() {\n    return this.#x;\n  }\n\n  method(other) {\n    this.#x = other.#m();\n\n    return #x in other;\n  }\n}",
    );
  });

  it("emits JSX elements and fragments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.jsx",
        'const el = <><UI.Button id="x" count={n}>{child}</UI.Button><span /></>;',
      ),
    );

    expect(generateJavaScript(input)).toBe(
      'const el = <><UI.Button id="x" count={n}>{child}</UI.Button><span /></>;',
    );
  });

  it("emits static member expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x;"),
    );

    expect(generateJavaScript(input)).toBe("obj.x;");
  });

  it("emits computed member expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'obj["x"];'),
    );

    expect(generateJavaScript(input)).toBe('obj["x"];');
  });

  it("emits optional member access as structured control flow", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let value = obj?.x;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nif (obj == null) {\n  $0 = undefined;\n} else {\n  $0 = obj.x;\n}\n\nlet value = $0;",
    );
  });

  it("emits optional calls as structured control flow", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let value = fn?.(arg);"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nif (fn == null) {\n  $0 = undefined;\n} else {\n  $0 = fn(arg);\n}\n\nlet value = $0;",
    );
  });

  it("emits optional member calls without rereading the loaded callee", () => {
    const ids = new IRIdAllocator();
    const input = new ModuleIRBuilder({ ids }).build(
      parseModule("test.js", "let value = obj.method?.(arg);"),
    );
    const fn = input.moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    new FunctionPassManager(new AnalysisManager()).run(fn, [
      createValueMaterializationPass({ ids }),
      createCopyPropagationPass(),
    ]);

    expect(generateJavaScript(input)).toBe(
      "let $7;\nlet $8;\nlet $0;\n\n$7 = obj;\n$8 = $7.method;\n\nif ($8 == null) {\n  $0 = undefined;\n} else {\n  $0 = $8.call($7, arg);\n}\n\nlet value = $0;",
    );
  });

  it("emits static property assignment", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x = 1;"),
    );

    expect(generateJavaScript(input)).toBe("obj.x = 1;");
  });

  it("emits computed property assignment", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj[key] = 1;"),
    );

    expect(generateJavaScript(input)).toBe("obj[key] = 1;");
  });

  it("emits array literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const xs = [a, , ...b];"),
    );

    expect(generateJavaScript(input)).toBe("const xs = [a,, ...b];");
  });

  it("emits object literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const obj = { x, y: z, [k]: v, ...rest };"),
    );

    expect(generateJavaScript(input)).toBe("const obj = { x, y: z, [k]: v, ...rest };");
  });

  it("emits object literal methods and accessors", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "const obj = { method() {}, get x() { return 1; }, set x(value) {} };",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "const obj = {\n  method() {},\n  get x() {\n    return 1;\n  },\n  set x(value) {}\n};",
    );
  });

  it("emits sequence expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = (first(), second(), third());"),
    );

    expect(generateJavaScript(input)).toBe("const value = (first(), second(), third());");
  });

  it("emits template literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const message = `hello ${name}`;"),
    );

    expect(generateJavaScript(input)).toBe("const message = `hello ${name}`;");
  });

  it("emits this expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "this.value;"),
    );

    expect(generateJavaScript(input)).toBe("this.value;");
  });

  it("emits canonicalized update expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = 1; x++;"),
    );

    expect(generateJavaScript(input)).toBe("let x = 1;\n\nx = x + 1;");
  });

  it("emits delete expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "delete obj[key];"),
    );

    expect(generateJavaScript(input)).toBe("delete obj[key];");
  });

  it("emits new expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = new Constructor(arg);"),
    );

    expect(generateJavaScript(input)).toBe("const value = new Constructor(arg);");
  });

  it("emits spread construct arguments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = new Constructor(arg, ...rest);"),
    );

    expect(generateJavaScript(input)).toBe("const value = new Constructor(arg, ...rest);");
  });

  it("emits import.meta", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const url = import.meta.url;"),
    );

    expect(generateJavaScript(input)).toBe("const url = import.meta.url;");
  });

  it("emits dynamic import expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./mod.js");'),
    );

    expect(generateJavaScript(input)).toBe('const mod = import("./mod.js");');
  });

  it("emits dynamic import options", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./data.json", { with: { type: "json" } });'),
    );

    expect(generateJavaScript(input)).toBe(
      'const mod = import("./data.json", { with: { type: "json" } });',
    );
  });

  it("emits static imports and exports as module records", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        'import "./setup.js"; import def, { a, b as c } from "./m.js"; import * as ns from "./n.js"; export const x = 1; const y = 2; export { y as z }; export { a as aa } from "./m.js"; export * from "./all.js"; export * as everything from "./all.js";',
      ),
    );

    expect(generateJavaScript(input)).toBe(
      'import "./setup.js";\nimport def from "./m.js";\nimport { a } from "./m.js";\nimport { b as c } from "./m.js";\nimport * as ns from "./n.js";\n\nconst x = 1;\nconst y = 2;\n\nexport { x };\nexport { y as z };\nexport { a as aa } from "./m.js";\n\nexport * from "./all.js";\nexport * as everything from "./all.js";',
    );
  });

  it("emits module string names and import attributes", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        'import "./setup.json" with { type: "json" }; import { "remote-name" as local } from "./m.js" with { type: "json" }; const value = 1; export { value as "public-name" }; export { "remote-name" as re } from "./m.js" with { type: "json" }; export * from "./all.js" with { type: "json" };',
      ),
    );

    expect(generateJavaScript(input)).toBe(
      'import "./setup.json" with { type: "json" };\nimport { "remote-name" as local } from "./m.js" with { type: "json" };\n\nconst value = 1;\n\nexport { value as "public-name" };\nexport { "remote-name" as re } from "./m.js" with { type: "json" };\n\nexport * from "./all.js" with { type: "json" };',
    );
  });

  it("emits default exports of named declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "export default function f() { return 1; }"),
    );

    expect(generateJavaScript(input)).toBe(
      "function f() {\n  return 1;\n}\n\nexport { f as default };",
    );
  });

  it("emits default expression exports in module body order", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "before(); export default foo(); after();"),
    );

    expect(generateJavaScript(input)).toBe("before();\n\nexport default foo();\n\nafter();");
  });

  it("emits anonymous default function and class exports", () => {
    const functionInput = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "export default function () { return 1; }"),
    );
    const classInput = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "export default class { method() {} }"),
    );

    expect(generateJavaScript(functionInput)).toBe("export default function () {\n  return 1;\n};");
    expect(generateJavaScript(classInput)).toBe("export default class {\n  method() {}\n};");
  });

  it("emits await expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'async function load() { return await import("./mod.js"); }'),
    );

    expect(generateJavaScript(input)).toBe(
      'async function load() {\n  return await import("./mod.js");\n}',
    );
  });

  it("emits RegExp literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const pattern = /abc/gi;"),
    );

    expect(generateJavaScript(input)).toBe("const pattern = /abc/gi;");
  });

  it("emits new.target", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f() { return new.target; }"),
    );

    expect(generateJavaScript(input)).toBe("function f() {\n  return new.target;\n}");
  });

  it("emits yield expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function* g() { return yield value; }"),
    );

    expect(generateJavaScript(input)).toBe("function* g() {\n  return yield value;\n}");
  });

  it("emits lexical destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const { x, y: z } = obj;"),
    );

    expect(generateJavaScript(input)).toBe("const { x, y: z } = obj;");
  });

  it("emits var destructuring declarations through hoisted stores", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "var { x } = obj;"),
    );

    expect(generateJavaScript(input)).toBe("var x = undefined;\n\n({ x } = obj);");
  });

  it("emits destructuring assignments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; ({ x } = obj);"),
    );

    expect(generateJavaScript(input)).toBe("let x = undefined;\n\n({ x } = obj);");
  });

  it("emits compound property assignment", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.x += 1;"),
    );

    expect(generateJavaScript(input)).toBe("obj.x = obj.x + 1;");
  });

  it("emits logical assignment as structured control flow", () => {
    const ids = new IRIdAllocator();
    const input = new ModuleIRBuilder({ ids }).build(
      parseModule("test.js", "let x; x ||= compute();"),
    );
    const fn = input.moduleIR.entryFunction;
    if (fn === null) throw new Error("Expected entry function");

    new FunctionPassManager(new AnalysisManager()).run(fn, [
      createValueMaterializationPass({ ids }),
    ]);

    expect(generateJavaScript(input)).toBe(
      "let $7;\nlet $3;\nlet x = undefined;\n\nif (x) {\n  $3 = x;\n} else {\n  $7 = compute();\n  x = $7;\n  $3 = $7;\n}",
    );
  });

  it("emits if statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; x = 2;"),
    );

    expect(generateJavaScript(input)).toBe("let x = undefined;\n\nif (a) {\n  x = 1;\n}\n\nx = 2;");
  });

  it("emits if else statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; else x = 2; x = 3;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let x = undefined;\n\nif (a) {\n  x = 1;\n} else {\n  x = 2;\n}\n\nx = 3;",
    );
  });

  it("emits switch statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "switch (x) { case 1: foo(); break; case 2: bar(); default: baz(); } qux();",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "switch (x) {\n  case 1:\n    foo();\n    break;\n\n  case 2:\n    bar();\n\n  default:\n    baz();\n    break;\n}\n\nqux();",
    );
  });

  it("emits try catch finally statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { foo(); } catch (e) { bar(e); } finally { baz(); } qux();"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  foo();\n} catch($0) {\n  let e = $0;\n\n  bar(e);\n} finally {\n  baz();\n}\n\nqux();",
    );
  });

  it("emits branches inside try arms", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { if (ok) foo(); else bar(); } catch (e) { handle(e); }"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  if (ok) {\n    foo();\n  } else {\n    bar();\n  }\n} catch($0) {\n  let e = $0;\n\n  handle(e);\n}",
    );
  });

  it("emits else-if branches inside try arms", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "try { if (error) setError(error); else if (stages) setStages(stages); } catch (e) { handle(e); }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  if (error) {\n    setError(error);\n  } else {\n    if (stages) {\n      setStages(stages);\n    }\n  }\n} catch($0) {\n  let e = $0;\n\n  handle(e);\n}",
    );
  });

  it("emits loops inside branch arms", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "if (ready) { for (const item of items) visit(item); } done();"),
    );

    expect(generateJavaScript(input)).toBe(
      "if (ready) {\n  for (let $2 of items) {\n    const item = $2;\n\n    visit(item);\n  }\n}\n\ndone();",
    );
  });

  it("emits nested for-of loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "for (const outer of outers) { for (const inner of inners) visit(outer, inner); }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "for (let $1 of outers) {\n  const outer = $1;\n\n  for (let $4 of inners) {\n    const inner = $4;\n\n    visit(outer, inner);\n  }\n}",
    );
  });

  it("emits return inside try with finally as structured JavaScript", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () { try { return 1; } finally { cleanup(); } };"),
    );

    expect(generateJavaScript(input)).toBe(
      "const f = function () {\n  try {\n    return 1;\n  } finally {\n    cleanup();\n  }\n};",
    );
  });

  it("emits throw statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "throw error;"),
    );

    expect(generateJavaScript(input)).toBe("throw error;");
  });

  it("emits debugger statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "debugger; foo();"),
    );

    expect(generateJavaScript(input)).toBe("debugger;\n\nfoo();");
  });

  it("emits throw inside try catch as structured JavaScript", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { throw error; } catch (e) { handle(e); }"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  throw error;\n} catch($0) {\n  let e = $0;\n\n  handle(e);\n}",
    );
  });

  it("emits break inside try with finally as structured JavaScript", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a) { try { break; } finally { cleanup(); } }"),
    );

    expect(generateJavaScript(input)).toBe(
      "while (a) {\n  try {\n    break;\n  } finally {\n    cleanup();\n  }\n}",
    );
  });

  it("emits logical expression joins with block params", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x = a && b;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $1;\n\nif (a) {\n  $1 = b;\n} else {\n  $1 = a;\n}\n\nlet x = $1;",
    );
  });

  it("emits nested conditional expression continuations after the outer branch", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "function g(isLoading, resolvedLocation, location) { const currentLocation = isLoading ? (resolvedLocation ?? location) : location; return { pathname: currentLocation }; }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "function g(isLoading, resolvedLocation, location) {\n  let $4;\n  let $6;\n\n  if (isLoading) {\n    if (resolvedLocation == null) {\n      $6 = location;\n    } else {\n      $6 = resolvedLocation;\n    }\n\n    $4 = $6;\n  } else {\n    $4 = location;\n  }\n\n  const currentLocation = $4;\n\n  return { pathname: currentLocation };\n}",
    );
  });

  it("emits while loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; while (a) x = 1; x = 2;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let x = undefined;\n\nwhile (a) {\n  x = 1;\n}\n\nx = 2;",
    );
  });

  it("emits while loops with short-circuit tests", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a && b) { foo(); }"),
    );

    expect(generateJavaScript(input)).toBe("while (a && b) {\n  foo();\n}");
  });

  it("emits while loops with nested short-circuit tests", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a && (b || c)) { foo(); }"),
    );

    expect(generateJavaScript(input)).toBe("while (a && (b || c)) {\n  foo();\n}");
  });

  it("emits while loops with conditional tests", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a ? b : c) { foo(); }"),
    );

    expect(generateJavaScript(input)).toBe("while (a ? b : c) {\n  foo();\n}");
  });

  it("emits while loops with nested value-region tests", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a && (b ? c : d)) { foo(); }"),
    );

    expect(generateJavaScript(input)).toBe("while (a && (b ? c : d)) {\n  foo();\n}");
  });

  it("emits break statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a) break; foo();"),
    );

    expect(generateJavaScript(input)).toBe("while (a) {\n  break;\n}\n\nfoo();");
  });

  it("emits labeled loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "outer: while (a) break outer; foo();"),
    );

    expect(generateJavaScript(input)).toBe("outer: while (a) {\n  break;\n}\n\nfoo();");
  });

  it("emits labeled block breaks", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "outer: { if (done) break outer; foo(); } bar();"),
    );

    expect(generateJavaScript(input)).toBe(
      "outer: {\n  if (done) {\n    break outer;\n  }\n\n  foo();\n\n  break outer;\n}\n\nbar();",
    );
  });

  it("emits labeled block breaks inside loop bodies", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "let i = 0; const log = []; for (; i < 3; i++) { inner: { if (i === 1) break inner; log.push(i); } }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "let i = 0;\nconst log = [];\n\nfor (; i < 3; i = i + 1) {\n  inner: {\n    if (i === 1) {\n      break inner;\n    }\n\n    log.push(i);\n\n    break inner;\n  }\n}",
    );
  });

  it("emits labeled switch breaks from nested controls", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "labelSwitch: switch (i) { case 1: for (const x of xs) { if (x === 2) break labelSwitch; foo(x); } bar(); } baz();",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "labelSwitch: {\n  switch (i) {\n    case 1:\n      for (let $3 of xs) {\n        const x = $3;\n\n        if (x === 2) {\n          break labelSwitch;\n        }\n\n        foo(x);\n      }\n      bar();\n      break;\n  }\n\n  break labelSwitch;\n}\n\nbaz();",
    );
  });

  it("emits do while loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; do x = 1; while (a); x = 2;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let x = undefined;\n\ndo {\n  x = 1;\n} while (a);\n\nx = 2;",
    );
  });

  it("emits destructured catch parameters through catch temporaries", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { foo(); } catch ({ message }) { bar(message); }"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  foo();\n} catch($0) {\n  let { message } = $0;\n\n  bar(message);\n}",
    );
  });

  it("emits for loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; for (x = 0; x < 3; x = x + 1) foo(); x = 4;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let x = undefined;\n\nx = 0;\n\nfor (; x < 3; x = x + 1) {\n  foo();\n}\n\nx = 4;",
    );
  });

  it("emits for-in loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const key in obj) foo(key); bar();"),
    );

    expect(generateJavaScript(input)).toBe(
      "for (let $1 in obj) {\n  const key = $1;\n\n  foo(key);\n}\n\nbar();",
    );
  });

  it("emits for-in loops with destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const { x } in obj) foo(x);"),
    );

    expect(generateJavaScript(input)).toBe(
      "for (let $1 in obj) {\n  const { x } = $1;\n\n  foo(x);\n}",
    );
  });

  it("emits for-of loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const x of xs) foo(x); bar();"),
    );

    expect(generateJavaScript(input)).toBe(
      "for (let $1 of xs) {\n  const x = $1;\n\n  foo(x);\n}\n\nbar();",
    );
  });

  it("emits for-of loops with destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const { x } of xs) foo(x);"),
    );

    expect(generateJavaScript(input)).toBe(
      "for (let $1 of xs) {\n  const { x } = $1;\n\n  foo(x);\n}",
    );
  });
});
