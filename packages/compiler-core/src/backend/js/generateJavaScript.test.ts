import { describe, expect, it } from "vitest";

import { compileSource } from "../../compile/compileSource";
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

    expect(generateJavaScript(input)).toBe("let $d0 = 1 + 2;\n\n$d0;");
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

    expect(generateJavaScript(input)).toBe("const $d0 = function $d1() {\n  return 1;\n};");
  });

  it("emits named function expression self-bindings", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let f = 1; const g = function f() { return typeof f; };"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = 1;\n\nconst $d1 = function $d2() {\n  return typeof $d2;\n};",
    );
  });

  it("emits async generator function expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async function* () {};"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = async function* () {};");
  });

  it("emits arrow function expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = async () => 1;"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = async () => {\n  return 1;\n};");
  });

  it("emits default, rest, and destructured function parameters", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f(x = 1, { y }, ...rest) { return y; }"),
    );

    expect(generateJavaScript(input)).toBe(
      "function $d0($d1 = 1, { y: $d2 }, ...$d3) {\n  return $d2;\n}",
    );
  });

  it("emits class declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C extends Base { method() { return 1; } }"),
    );

    expect(generateJavaScript(input)).toBe(
      "class $d0 extends Base {\n  method() {\n    return 1;\n  }\n}",
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
      "const $d0 = class {\n  constructor() {}\n  static create() {}\n\n  get value() {\n    return 1;\n  }\n\n  set value($d1) {}\n};",
    );
  });

  it("emits named class expression self-bindings", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let C = 1; const D = class C { static m() { return typeof C; } };"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = 1;\n\nconst $d1 = class $d2 {\n  static m() {\n    return typeof $d2;\n  }\n};",
    );
  });

  it("emits named class expression self-bindings in heritage", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let C = class {}; const D = class C extends C {};"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = class {};\nconst $d1 = class $d2 extends $d2 {};",
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
      "class $d0 extends Base {\n  constructor($d1) {\n    super($d1);\n  }\n\n  get value() {\n    return super.value;\n  }\n\n  method() {\n    return super.m(1);\n  }\n}",
    );
  });

  it("emits public class fields", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { x = 1; y; static count = 0; }"),
    );

    expect(generateJavaScript(input)).toBe("class $d0 {\n  x = 1;\n  y;\n  static count = 0;\n}");
  });

  it("emits control-flow class field initializers as arrow IIFEs", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const flag = true; class C { value = flag ? "a" : "b"; }'),
    );

    expect(generateJavaScript(input)).toBe(
      'const $d0 = true;\n\nclass $d1 {\n  value = (() => {\n    let $3;\n\n    if ($d0) {\n      $3 = "a";\n    } else {\n      $3 = "b";\n    }\n\n    return $3;\n  })();\n}',
    );
  });

  it("emits super property writes", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "class C extends Base { method() { super.x = 1; super.x += 2; super.x++; } }",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "class $d0 extends Base {\n  method() {\n    super.x = 1;\n    super.x = super.x + 2;\n    super.x = super.x + 1;\n  }\n}",
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
      "class $d0 {\n  #x = 1;\n\n  #m() {\n    return this.#x;\n  }\n\n  method($d1) {\n    this.#x = $d1.#m();\n\n    return #x in $d1;\n  }\n}",
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
      'const $d0 = <><UI.Button id="x" count={n}>{child}</UI.Button><span /></>;',
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
      "let $0;\n\nif (obj == null) {\n  $0 = undefined;\n} else {\n  $0 = obj.x;\n}\n\nlet $d0 = $0;",
    );
  });

  it("emits optional calls as structured control flow", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let value = fn?.(arg);"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nif (fn == null) {\n  $0 = undefined;\n} else {\n  $0 = fn(arg);\n}\n\nlet $d0 = $0;",
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
      "let $7;\nlet $8;\nlet $0;\n\n$7 = obj;\n$8 = $7.method;\n\nif ($8 == null) {\n  $0 = undefined;\n} else {\n  $0 = $8.call($7, arg);\n}\n\nlet $d0 = $0;",
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

    expect(generateJavaScript(input)).toBe("const $d0 = [a,, ...b];");
  });

  it("emits object literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const obj = { x, y: z, [k]: v, ...rest };"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = { x, y: z, [k]: v, ...rest };");
  });

  it("emits object literal methods and accessors", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "const obj = { method() {}, get x() { return 1; }, set x(value) {} };",
      ),
    );

    expect(generateJavaScript(input)).toBe(
      "const $d0 = {\n  method() {},\n  get x() {\n    return 1;\n  },\n  set x($d1) {}\n};",
    );
  });

  it("emits sequence expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = (first(), second(), third());"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = (first(), second(), third());");
  });

  it("emits template literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const message = `hello ${name}`;"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = `hello ${name}`;");
  });

  it("emits tagged template expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "export function run(tag, name) { return tag`hello ${name}`; }"),
    );

    expect(generateJavaScript(input)).toBe(
      "function $d0($d1, $d2) {\n  return $d1`hello ${$d2}`;\n}\n\nexport { $d0 as run };",
    );
  });

  it("preserves tagged template runtime semantics", async () => {
    const source = "export function run(tag, name) { return tag`hello ${name}`; }";
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(
      module.run(
        (strings: TemplateStringsArray, value: string) => [
          strings[0],
          strings.raw[0],
          value,
          Object.isFrozen(strings),
          Object.isFrozen(strings.raw),
        ],
        "Ada",
      ),
    ).toEqual(["hello ", "hello ", "Ada", true, true]);
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

    expect(generateJavaScript(input)).toBe("let $d0 = 1;\n\n$d0 = $d0 + 1;");
  });

  it("emits delete expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "delete obj[key];"),
    );

    expect(generateJavaScript(input)).toBe("delete obj[key];");
  });

  it("emits unused unary expression statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "typeof x;"),
    );

    expect(generateJavaScript(input)).toBe("typeof x;");
  });

  it("emits unused binary expression statements", async () => {
    const source =
      "export function run(){ let hit = 0; ({ valueOf(){ hit = 1; return 0; } }) + 1; return hit; }";
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("emits unused await expression statements", async () => {
    const source =
      "export async function run(){ let hit = 0; await Promise.resolve().then(() => { hit = 1; }); return hit; }";
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    await expect(module.run()).resolves.toBe(1);
  });

  it("emits unused dynamic import expression statements", async () => {
    const source =
      'export async function run(){ globalThis.__compilerProbe = 0; import("data:text/javascript,globalThis.__compilerProbe=1"); await new Promise((resolve) => setTimeout(resolve, 50)); return globalThis.__compilerProbe; }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    await expect(module.run()).resolves.toBe(1);
  });

  it("emits unused template literal expression statements", async () => {
    const source =
      'export function run(){ let hit = 0; `${{ toString(){ hit = 1; return "x"; } }}`; return hit; }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("emits unused global read expression statements", async () => {
    const source =
      'export function run(){ try { missingGlobal; return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("emits unused binding read expression statements", async () => {
    const source =
      'export function run(){ try { { x; let x; } return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("emits unused array literal expression statements", async () => {
    const source =
      "export function run(){ let hit = 0; [...{ [Symbol.iterator](){ hit = 1; return [][Symbol.iterator](); } }]; return hit; }";
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("emits unused object literal expression statements", async () => {
    const source =
      "export function run(){ let hit = 0; ({ ...{ get x(){ hit = 1; return 0; } } }); return hit; }";
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("emits unused private-name check expression statements", async () => {
    const source =
      'export function run(){ class C { #x; m(){ try { #x in null; return "no throw"; } catch(e) { return e instanceof TypeError; } } } return new C().m(); }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("emits unused class expression statements", async () => {
    const source =
      'export function run(){ try { (class extends 1 {}); return "no throw"; } catch(e) { return e instanceof TypeError; } }';
    const { code } = compileSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("emits new expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = new Constructor(arg);"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = new Constructor(arg);");
  });

  it("emits spread construct arguments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const value = new Constructor(arg, ...rest);"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = new Constructor(arg, ...rest);");
  });

  it("emits import.meta", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const url = import.meta.url;"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = import.meta.url;");
  });

  it("emits dynamic import expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./mod.js");'),
    );

    expect(generateJavaScript(input)).toBe('const $d0 = import("./mod.js");');
  });

  it("emits dynamic import options", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", 'const mod = import("./data.json", { with: { type: "json" } });'),
    );

    expect(generateJavaScript(input)).toBe(
      'const $d0 = import("./data.json", { with: { type: "json" } });',
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
      'import "./setup.js";\nimport def from "./m.js";\nimport { a } from "./m.js";\nimport { b as c } from "./m.js";\nimport * as ns from "./n.js";\n\nconst $d4 = 1;\nconst $d5 = 2;\n\nexport { $d4 as x };\nexport { $d5 as z };\nexport { a as aa } from "./m.js";\n\nexport * from "./all.js";\nexport * as everything from "./all.js";',
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
      'import "./setup.json" with { type: "json" };\nimport { "remote-name" as local } from "./m.js" with { type: "json" };\n\nconst $d1 = 1;\n\nexport { $d1 as "public-name" };\nexport { "remote-name" as re } from "./m.js" with { type: "json" };\n\nexport * from "./all.js" with { type: "json" };',
    );
  });

  it("emits default exports of named declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "export default function f() { return 1; }"),
    );

    expect(generateJavaScript(input)).toBe(
      "function $d0() {\n  return 1;\n}\n\nexport { $d0 as default };",
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
      'async function $d0() {\n  return await import("./mod.js");\n}',
    );
  });

  it("emits RegExp literals", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const pattern = /abc/gi;"),
    );

    expect(generateJavaScript(input)).toBe("const $d0 = /abc/gi;");
  });

  it("emits new.target", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f() { return new.target; }"),
    );

    expect(generateJavaScript(input)).toBe("function $d0() {\n  return new.target;\n}");
  });

  it("emits yield expressions", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function* g() { return yield value; }"),
    );

    expect(generateJavaScript(input)).toBe("function* $d0() {\n  return yield value;\n}");
  });

  it("emits unused yield expression statements", async () => {
    const source = "export function* run() { yield 1; yield 2; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect([...module.run()]).toEqual([1, 2]);
  });

  it("emits unused async generator yield expression statements", async () => {
    const source = "export async function* run() { yield 1; yield 2; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    const out = [];
    for await (const value of module.run()) out.push(value);
    expect(out).toEqual([1, 2]);
  });

  it("emits lexical destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const { x, y: z } = obj;"),
    );

    expect(generateJavaScript(input)).toBe("const { x: $d0, y: $d1 } = obj;");
  });

  it("emits var destructuring declarations through hoisted stores", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "var { x } = obj;"),
    );

    expect(generateJavaScript(input)).toBe("var $d0 = undefined;\n\n({ x: $d0 } = obj);");
  });

  it("emits destructuring assignments", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; ({ x } = obj);"),
    );

    expect(generateJavaScript(input)).toBe("let $d0 = undefined;\n\n({ x: $d0 } = obj);");
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
      "let $7;\nlet $8;\nlet $3;\nlet $d0 = undefined;\n\n$7 = $d0;\n\nif ($7) {\n  $3 = $7;\n} else {\n  $8 = compute();\n  $d0 = $8;\n  $3 = $8;\n}",
    );
  });

  it("emits if statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; x = 2;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = undefined;\n\nif (a) {\n  $d0 = 1;\n}\n\n$d0 = 2;",
    );
  });

  it("emits if else statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; if (a) x = 1; else x = 2; x = 3;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = undefined;\n\nif (a) {\n  $d0 = 1;\n} else {\n  $d0 = 2;\n}\n\n$d0 = 3;",
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
      "try {\n  foo();\n} catch($0) {\n  let $d0 = $0;\n\n  bar($d0);\n} finally {\n  baz();\n}\n\nqux();",
    );
  });

  it("emits branches inside try arms", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { if (ok) foo(); else bar(); } catch (e) { handle(e); }"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  if (ok) {\n    foo();\n  } else {\n    bar();\n  }\n} catch($0) {\n  let $d0 = $0;\n\n  handle($d0);\n}",
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
      "try {\n  if (error) {\n    setError(error);\n  } else {\n    if (stages) {\n      setStages(stages);\n    }\n  }\n} catch($0) {\n  let $d0 = $0;\n\n  handle($d0);\n}",
    );
  });

  it("emits loops inside branch arms", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "if (ready) { for (const item of items) visit(item); } done();"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $1;\n\nif (ready) {\n  for (const $d0 of items) {\n    visit($d0);\n  }\n}\n\ndone();",
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
      "let $0;\nlet $4;\n\nfor (const $d0 of outers) {\n  for (const $d1 of inners) {\n    visit($d0, $d1);\n  }\n}",
    );
  });

  it("emits return inside try with finally as structured JavaScript", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const f = function () { try { return 1; } finally { cleanup(); } };"),
    );

    expect(generateJavaScript(input)).toBe(
      "const $d0 = function () {\n  try {\n    return 1;\n  } finally {\n    cleanup();\n  }\n};",
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
      "try {\n  throw error;\n} catch($0) {\n  let $d0 = $0;\n\n  handle($d0);\n}",
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
      "let $1;\n\nif (a) {\n  $1 = b;\n} else {\n  $1 = a;\n}\n\nlet $d0 = $1;",
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
      "function $d0($d1, $d2, $d3) {\n  let $4;\n  let $6;\n\n  if ($d1) {\n    if ($d2 == null) {\n      $6 = $d3;\n    } else {\n      $6 = $d2;\n    }\n\n    $4 = $6;\n  } else {\n    $4 = $d3;\n  }\n\n  const $d4 = $4;\n\n  return { pathname: $d4 };\n}",
    );
  });

  it("emits while loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; while (a) x = 1; x = 2;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = undefined;\n\nwhile (a) {\n  $d0 = 1;\n}\n\n$d0 = 2;",
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

  it("preserves postfix update values in loop tests", () => {
    const source =
      "export function run() { const log = []; let n = 0; while (n++ < 3) { log.push(n); } return log; }";

    expect(compileTestSource(source)).toBe(
      "function $d0() {\n  let $17;\n  let $16;\n  let $18;\n  let $19;\n  const $d1 = [];\n\n  $17 = $d1;\n\n  let $d2 = 0;\n\n  $16 = $d2;\n\n  while (($18 = $d2, $d2 = $18 + 1, $19 = $d2, $18 < 3)) {\n    $d1.push($d2);\n    $16 = $19;\n  }\n\n  return $d1;\n}\n\nexport { $d0 as run };",
    );
  });

  it("emits break statements", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "while (a) break; foo();"),
    );

    expect(generateJavaScript(input)).toBe("while (a) {\n  break;\n}\n\nfoo();");
  });

  it("emits continue after edge copies", () => {
    const source =
      "export function run() { let x = 0; let y = 0; while (x < 4) { x = x + 1; if (x < 3) continue; y = y + x; } return y; }";

    expect(compileTestSource(source)).toBe(
      "function $d0() {\n  let $23;\n  let $24;\n  let $21;\n  let $22;\n  let $25;\n  let $26;\n  let $d1 = 0;\n\n  $23 = $d1;\n\n  let $d2 = 0;\n\n  $24 = $d2;\n  $21 = $23;\n  $22 = $24;\n\n  while ($d1 < 4) {\n    $d1 = $d1 + 1;\n    $25 = $d1;\n\n    if ($d1 < 3) {\n      $21 = $25;\n\n      continue;\n    }\n\n    $d2 = $d2 + $d1;\n    $26 = $d2;\n    $21 = $25;\n    $22 = $26;\n  }\n\n  return $d2;\n}\n\nexport { $d0 as run };",
    );
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
      "let $d0 = 0;\nconst $d1 = [];\n\nfor (; $d0 < 3; $d0 = $d0 + 1) {\n  inner: {\n    if ($d0 === 1) {\n      break inner;\n    }\n\n    $d1.push($d0);\n\n    break inner;\n  }\n}",
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
      "let $2;\n\nlabelSwitch: {\n  switch (i) {\n    case 1:\n      for (const $d0 of xs) {\n        if ($d0 === 2) {\n          break labelSwitch;\n        }\n\n        foo($d0);\n      }\n      bar();\n      break;\n  }\n\n  break labelSwitch;\n}\n\nbaz();",
    );
  });

  it("preserves switch breaks after nested for-of loops", async () => {
    const forOfSource =
      "export function run() { const log = []; switch (0) { case 0: for (const i of [0, 1, 2]) { if (i === 1) break; log.push(i); } break; default: log.push('outer-default'); } return log; }";

    const code = compileTestSource(forOfSource);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([0]);
  });

  it("preserves switch breaks after nested for-in loops", async () => {
    const forInSource =
      "export function run() { const log = []; switch (0) { case 0: for (const k in { a: 1, b: 2 }) { if (k === 'b') break; log.push(k); } break; default: log.push('outer-default'); } return log; }";

    const code = compileTestSource(forInSource);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual(["a"]);
  });

  it("preserves try finally through switch and nested loop breaks", () => {
    const source =
      "export function run() { const log = []; try { switch (1) { case 1: for (let j = 0; j < 2; j++) { if (j === 1) break; log.push('j' + j); } break; default: log.push('d'); } } finally { log.push('f'); } return log; }";

    expect(compileTestSource(source)).toBe(
      'function $d0() {\n  let $34;\n  let $31;\n  let $32;\n  let $30;\n  const $d1 = [];\n\n  $34 = $d1;\n\n  try {\n    switch (1) {\n      case 1:\n        for (let $d2 = ($30 = 0, $30); $d2 < 2; ($d2 = $d2 + 1, $30 = $d2)) {\n          if ($d2 === 1) {\n            break;\n          }\n\n          $d1.push("j" + $d2);\n        }\n        $31 = $30;\n        break;\n\n      default:\n        $d1.push("d");\n        $31 = undefined;\n        break;\n    }\n\n    $32 = $31;\n  } finally {\n    $32 = undefined;\n    $d1.push("f");\n  }\n\n  return $d1;\n}\n\nexport { $d0 as run };',
    );
  });

  it("emits optimized constant loop tests", () => {
    const source =
      "export function run() { const log = []; function f() { outer: while (true) { try { return 'r'; } finally { break outer; } } return 'after'; } log.push(f()); return log; }";

    expect(compileTestSource(source)).toBe(
      'function $d0() {\n  let $14;\n  let $15;\n\n  function $d2() {\n    outer: while (true) {\n      try {\n        return "r";\n      } finally {\n        break;\n      }\n    }\n\n    return "after";\n  }\n\n  $14 = $d2;\n\n  const $d1 = [];\n\n  $15 = $d1;\n  $d1.push($d2());\n\n  return $d1;\n}\n\nexport { $d0 as run };',
    );
  });

  it("emits do while loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; do x = 1; while (a); x = 2;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = undefined;\n\ndo {\n  $d0 = 1;\n} while (a);\n\n$d0 = 2;",
    );
  });

  it("emits destructured catch parameters through catch temporaries", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "try { foo(); } catch ({ message }) { bar(message); }"),
    );

    expect(generateJavaScript(input)).toBe(
      "try {\n  foo();\n} catch($0) {\n  let { message: $d0 } = $0;\n\n  bar($d0);\n}",
    );
  });

  it("emits for loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "let x; for (x = 0; x < 3; x = x + 1) foo(); x = 4;"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $d0 = undefined;\n\nfor (($d0 = 0); $d0 < 3; $d0 = $d0 + 1) {\n  foo();\n}\n\n$d0 = 4;",
    );
  });

  it("emits shadowed for lexical declarations with distinct binding names", () => {
    const source =
      "export function run() { const log = []; let n = 10; for (let n = 0; n < 2; n++) { log.push(n); } log.push(n); return log; }";

    expect(compileTestSource(source)).toBe(
      "function $d0() {\n  let $23;\n  let $24;\n  let $22;\n  const $d1 = [];\n\n  $23 = $d1;\n\n  let $d2 = 10;\n\n  $24 = $d2;\n\n  for (let $d3 = ($22 = 0, $22); $d3 < 2; ($d3 = $d3 + 1, $22 = $d3)) {\n    $d1.push($d3);\n  }\n\n  $d1.push($d2);\n\n  return $d1;\n}\n\nexport { $d0 as run };",
    );
  });

  it("preserves per-iteration for-header lexical captures", async () => {
    const source =
      "export function run() { const fns = []; for (let i = 0; i < 3; i++) fns.push(() => i); return fns.map((fn) => fn()); }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([0, 1, 2]);
  });

  it("preserves destructured for-header lexical captures", async () => {
    const source =
      "export function run() { const fns = []; for (let { x = 0 } = {}; x < 2; x++) fns.push(() => x); return fns.map((fn) => fn()); }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([0, 1]);
  });

  it("preserves side effects inside lexical for-header initializers", async () => {
    const source =
      "export function run() { let probeDecl; for (let _ = (probeDecl = function () { return 7; }); false; ) {} return probeDecl(); }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(7);
  });

  it("preserves side effects inside var for-header initializers", async () => {
    const source =
      "export function run() { var probeDecl; for (var _ = (probeDecl = function () { return 7; }); false; ) {} return probeDecl(); }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(7);
  });

  it("preserves multiple for-header declarator evaluation order", async () => {
    const source =
      "export function run() { const log = []; for (let a = log.push('a'), b = log.push('b'); false; ) {} return log; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual(["a", "b"]);
  });

  it("preserves captures from earlier for-header lexical declarators", async () => {
    const source =
      'export function run() { let probe; for (let x = "inside", _ = probe = function () { return x; }; false; ) {} return probe(); }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe("inside");
  });

  it("preserves complex for-update expression side effects", async () => {
    const source =
      'export function run() { const out = []; let i = 0; for (; i < 2; (i++, i < 2 && out.push("u"))) out.push(i); return out; }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([0, "u", 1]);
  });

  it("emits empty const destructuring for-header initializers", async () => {
    const source = "export function run() { for (const {} = {}; false; ) {} return 1; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("preserves empty destructuring for-header throws", async () => {
    const source = "export function run() { for (const {} = null; false; ) {} return 1; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(() => module.run()).toThrow(TypeError);
  });

  it("evaluates destructuring defaults only after property reads produce undefined", async () => {
    const source =
      'export function run() { let count = 0; const source = Object.defineProperty({}, "poisoned", { get() { throw new Error("poisoned"); } }); try { const { poisoned: x = ++count } = source; return x; } catch (e) { return [e.message, count]; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual(["poisoned", 0]);
  });

  it("evaluates destructuring defaults lazily when values are undefined", async () => {
    const source =
      "export function run() { let count = 0; const { missing: x = ++count } = {}; return [x, count]; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([1, 1]);
  });

  it("emits empty var destructuring for-header initializers", async () => {
    const source = "export function run() { for (var [] = []; false; ) {} return 1; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("emits for-in loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const key in obj) foo(key); bar();"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nfor (const $d0 in obj) {\n  foo($d0);\n}\n\nbar();",
    );
  });

  it("emits for-in loops with destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const { x } in obj) foo(x);"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nfor (let $1 in obj) {\n  const { x: $d0 } = $1;\n\n  foo($d0);\n}",
    );
  });

  it("preserves for-in lexical declaration TDZ while evaluating the object", async () => {
    const source =
      'export function run() { let x = "outside"; try { for (let x in { x }) {} return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("preserves for-in lexical declaration TDZ for closures created while evaluating the object", async () => {
    const source =
      'export function run() { let x = "outside"; let probe; for (let x in { i: probe = function () { return typeof x; } }) {} try { probe(); return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("preserves for-in lexical declaration TDZ through conditional object evaluation", async () => {
    const source =
      'export function run() { let x = "outside"; let probe; for (let x in (true ? { i: (probe = function () { return typeof x; }, 1) } : {})) {} try { probe(); return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("evaluates for-in logical objects once before iteration", async () => {
    const source =
      "export function run() { let calls = 0; const keys = []; function object() { calls++; return { a: 1, b: 2 }; } for (const key in object() || {}) { if (key === 'a') continue; keys.push(key); } return [calls, keys]; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([1, ["b"]]);
  });

  it("emits for-of loops", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const x of xs) foo(x); bar();"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nfor (const $d0 of xs) {\n  foo($d0);\n}\n\nbar();",
    );
  });

  it("emits for-of loops with destructuring declarations", () => {
    const input = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "for (const { x } of xs) foo(x);"),
    );

    expect(generateJavaScript(input)).toBe(
      "let $0;\n\nfor (let $1 of xs) {\n  const { x: $d0 } = $1;\n\n  foo($d0);\n}",
    );
  });

  it("evaluates for-of logical iterables once before iteration", async () => {
    const source =
      "export function run() { let calls = 0; const values = []; function items() { calls++; return [1, 2]; } for (const value of items() || []) { if (value === 1) continue; values.push(value); } return [calls, values]; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([1, [2]]);
  });

  it("preserves for-of lexical declaration TDZ for closures created while evaluating the iterable", async () => {
    const source =
      'export function run() { let x = "outside"; let probe; for (let x of (probe = function () { return typeof x; }, [])) {} try { probe(); return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("preserves for-of lexical declaration TDZ through logical iterable evaluation", async () => {
    const source =
      'export function run() { let x = "outside"; let probe; for (let x of ((probe = function () { return typeof x; }) && [])) {} try { probe(); return "no throw"; } catch (e) { return e instanceof ReferenceError; } }';
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(true);
  });

  it("evaluates for-in sequence objects once before iteration", async () => {
    const source =
      "export function run() { let calls = 0; const keys = []; function object() { calls++; return { a: 1, b: 2 }; } for (const key in (false && {}, object())) { if (key === 'a') continue; keys.push(key); } return [calls, keys]; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([1, ["b"]]);
  });

  it("evaluates for-of sequence iterables once before iteration", async () => {
    const source =
      "export function run() { let calls = 0; const values = []; function items() { calls++; return [1, 2]; } for (const value of (false && [], items())) { if (value === 1) continue; values.push(value); } return [calls, values]; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toEqual([1, [2]]);
  });

  it("emits for-of loops with empty destructuring declarations", async () => {
    const source = "export function run() { for (const {} of [{}]) { return 1; } return 0; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(module.run()).toBe(1);
  });

  it("preserves empty for-of destructuring throws", async () => {
    const source = "export function run() { for (const {} of [null]) {} return 0; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(() => module.run()).toThrow(TypeError);
  });

  it("emits and runs for-await-of loops", async () => {
    const source =
      "export async function run() { const out = []; for await (const value of [Promise.resolve(1), Promise.resolve(2)]) { out.push(value); } return out; }";
    const code = compileTestSource(source);
    const module = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`);

    expect(code).toContain("for await (const");
    await expect(module.run()).resolves.toEqual([1, 2]);
  });
});

function compileTestSource(source: string): string {
  return compileSource(source, { sourceName: "test.js" }).code;
}
