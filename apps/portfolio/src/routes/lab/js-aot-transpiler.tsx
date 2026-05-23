import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { createPageMeta } from "../../lib/seo";
import { CompilerPlayground } from "../../pages/CompilerPlayground";

const DESCRIPTION =
  "Ahead-of-time optimizing compiler for JavaScript. SSA-based IR, constant propagation, dead code elimination.";

export const compileCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { source: string; options?: Record<string, boolean> })
  .handler(async ({ data }) => {
    const { source } = data;
    try {
      const stages = {
        output: "",
        hir: "",
        ssa: "",
        optimized: "",
        ssaEliminated: "",
        lateOptimized: "",
      };
      const { compileSource, formatModuleIR } = await import("@i2-labs/compiler/compile");
      const result = compileSource(source, {
        sourceName: "input.js",
        observer: {
          onStage(event) {
            switch (event.stage) {
              case "hir":
                stages.hir = formatModuleIR(event.moduleIR);
                break;
              case "ssa":
                stages.ssa = formatModuleIR(event.moduleIR);
                break;
              case "optimized":
                stages.optimized = formatModuleIR(event.moduleIR);
                break;
              case "ssa-eliminated":
                stages.ssaEliminated = formatModuleIR(event.moduleIR);
                break;
              case "late-optimized":
                stages.lateOptimized = formatModuleIR(event.moduleIR);
                break;
            }
          },
        },
      });
      stages.output = result.code;
      return { stages, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { stages: null, error: message };
    }
  });

export const Route = createFileRoute("/lab/js-aot-transpiler")({
  head: () =>
    createPageMeta({
      title: "JS AOT Compiler | Ish Chhabra",
      description: DESCRIPTION,
      path: "/lab/js-aot-transpiler",
    }),
  component: CompilerPlayground,
});
