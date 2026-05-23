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
});
