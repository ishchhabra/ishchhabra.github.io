import { describe, expect, it } from "vitest";

import { formatModuleIR } from "../ir/formatModuleIR";
import type { CompilerStage } from "./CompilerObserver";
import { compileSource } from "./compileSource";

describe("compileSource", () => {
  it("notifies observers about compiler stages, passes, and output", () => {
    const stages: CompilerStage[] = [];
    const passNames: string[] = [];
    const snapshots: string[] = [];
    let observedOutput = "";

    const result = compileSource("const x = 1 + 2; x;", {
      observer: {
        onStage(event) {
          stages.push(event.stage);
          snapshots.push(formatModuleIR(event.moduleIR));
        },
        onPassEnd(event) {
          passNames.push(event.passName);
        },
        onOutput(event) {
          observedOutput = event.code;
        },
      },
    });

    expect(stages).toEqual(["hir", "ssa", "optimized", "ssa-eliminated", "late-optimized"]);
    expect(passNames).toContain("ssa-construction");
    expect(passNames).toContain("ssa-elimination");
    expect(snapshots.every((snapshot) => snapshot.includes("module #"))).toBe(true);
    expect(observedOutput).toBe(result.code);
  });

  it("preserves function declaration anchors through binding promotion", () => {
    const result = compileSource(
      'function Component() { return <div />; }\nexport const Route = createFileRoute("/x")({ component: Component });',
      { sourceName: "test.jsx" },
    );

    expect(result.code).toBe(
      'function $d0() {\n  return <div />;\n}\n\nconst $d1 = createFileRoute("/x")({ component: $d0 });\n\nexport { $d1 as Route };',
    );
  });

  it("preserves bindings captured by class field initializers", async () => {
    const result = compileSource(
      "const xs = [1]; class C { value = xs[0]; } export const value = new C().value;",
      { sourceName: "test.js" },
    );
    const module = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(result.code)}`
    );

    expect(module.value).toBe(1);
  });

  it("continues after a nullish optional chain result", async () => {
    const result = compileSource(
      `function make(options) {
  const useNumberId = options.advanced?.database?.generateId === "serial";

  if (useNumberId) {
    throw new Error("bad");
  }

  return { transaction: false };
}

export const value = JSON.stringify(make({}));`,
      { sourceName: "test.js" },
    );
    const module = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(result.code)}`
    );

    expect(module.value).toBe('{"transaction":false}');
  });

  it("preserves object rest destructuring assignment writes", async () => {
    const source = `export function repro(value) {
  let encryptedKey;
  let parameters;

  ({ encryptedKey, ...parameters } = value);

  return [encryptedKey, parameters];
}`;
    const result = compileSource(source, { sourceName: "test.js" });
    const direct = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
    const compiled = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(result.code)}`
    );
    const input = { encryptedKey: "key", alg: "A256GCM", iv: "abc" };

    expect(compiled.repro(input)).toEqual(direct.repro(input));
  });

  it("preserves object rest destructuring binding values", async () => {
    const source = `export function repro(value) {
  const { encryptedKey, ...parameters } = value;

  return [encryptedKey, parameters];
}`;
    const result = compileSource(source, { sourceName: "test.js" });
    const direct = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
    const compiled = await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(result.code)}`
    );
    const input = { encryptedKey: "key", alg: "A256GCM", iv: "abc" };

    expect(compiled.repro(input)).toEqual(direct.repro(input));
  });

  it("materializes parameter binding values before for-of headers", async () => {
    const source = `(function (a, b) {
  for (var value of [1]) {
    a = b;
  }
})(1, 2);

export const result = 0;`;
    const result = compileSource(source, { sourceName: "test.js" });

    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
    await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(result.code)}`);
  });
});
