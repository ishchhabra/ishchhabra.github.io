import { describe, expect, it } from "vitest";
import { ModuleIRBuilder } from "../../frontend/ModuleIRBuilder";
import { parseModule } from "../../frontend/parse/parseModule";
import { AnalysisManager } from "../analysis";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { CreateFunctionOp } from "../ops/functions/CreateFunctionOp";
import { createDeadCodeEliminationPass } from "./DeadCodeEliminationPass";
import { createDeadDeclarationEliminationPass } from "./DeadDeclarationEliminationPass";

describe("DeadDeclarationEliminationPass", () => {
  it("removes unreferenced function declaration initializers", () => {
    const build = buildModule("function unused() { return 1; }");
    const entry = build.moduleIR.entryFunction!.entryBlock;

    createDeadDeclarationEliminationPass().run(build.moduleIR, new AnalysisManager());

    expect(entry.operations).toHaveLength(1);
    expect(entry.operations[0]).toBeInstanceOf(CreateFunctionOp);
  });

  it("preserves referenced function declaration initializers", () => {
    const build = buildModule("function used() { return 1; } used();");
    const entry = build.moduleIR.entryFunction!.entryBlock;

    createDeadDeclarationEliminationPass().run(build.moduleIR, new AnalysisManager());

    expect(entry.operations.some((op) => op instanceof InitializeBindingOp)).toBe(true);
  });

  it("preserves exported function declaration initializers", () => {
    const build = buildModule("export function exported() { return 1; }");
    const entry = build.moduleIR.entryFunction!.entryBlock;

    createDeadDeclarationEliminationPass().run(build.moduleIR, new AnalysisManager());

    expect(entry.operations.some((op) => op instanceof InitializeBindingOp)).toBe(true);
  });

  it("preserves function declaration initializers referenced by delete", () => {
    const build = buildModule("function deleted() { return 1; } delete deleted;");
    const entry = build.moduleIR.entryFunction!.entryBlock;

    createDeadDeclarationEliminationPass().run(build.moduleIR, new AnalysisManager());

    expect(entry.operations.some((op) => op instanceof InitializeBindingOp)).toBe(true);
  });

  it("leaves pure function creation for scalar DCE", () => {
    const build = buildModule("function unused() { return 1; }");
    const analyses = new AnalysisManager();
    const entry = build.moduleIR.entryFunction!.entryBlock;

    createDeadDeclarationEliminationPass().run(build.moduleIR, analyses);
    createDeadCodeEliminationPass().run(build.moduleIR.entryFunction!, analyses);

    expect(entry.operations).toEqual([]);
  });
});

function buildModule(source: string) {
  return new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(parseModule("test.js", source));
}
