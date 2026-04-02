import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createPageMeta } from "../../lib/seo";
import { CompilerPlayground } from "../../pages/CompilerPlayground";

const DESCRIPTION =
  "Ahead-of-time optimizing compiler for JavaScript. SSA-based IR, constant propagation, dead code elimination.";

export const compileCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { source: string; options?: Record<string, boolean> })
  .handler(async ({ data }) => {
    const { source, options = {} } = data;
    try {
      const { compileFromSourceWithStages, CompilerOptionsSchema } =
        await import("@i2-labs/compiler/compile");
      const parsed = CompilerOptionsSchema.parse(options);
      const stages = compileFromSourceWithStages(source, parsed as any);
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
