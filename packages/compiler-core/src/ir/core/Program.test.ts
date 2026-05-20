import { describe, expect, it } from "vitest";
import { makeModuleId } from "./ModuleId";
import { Program } from "./Program";
import { ProgramModule } from "./ProgramModule";

function programModule(id: number): ProgramModule {
  return new ProgramModule(makeModuleId(id), {
    resolvedId: `/src/${id}.js`,
    kind: "esm",
  });
}

describe("Program", () => {
  it("adds modules and records ownership", () => {
    const program = new Program();
    const module = programModule(1);

    program.addModule(module);

    expect(program.modules).toEqual([module]);
    expect(module.ownerProgram).toBe(program);
  });

  it("rejects adding the same module twice", () => {
    const program = new Program();
    const module = programModule(1);

    program.addModule(module);

    expect(() => program.addModule(module)).toThrow(
      "already belongs to this program",
    );
  });

  it("rejects adding a module owned by another program", () => {
    const first = new Program();
    const second = new Program();
    const module = programModule(1);

    first.addModule(module);

    expect(() => second.addModule(module)).toThrow(
      "already belongs to another program",
    );
  });

  it("rejects adding a different module with the same id", () => {
    const program = new Program();

    program.addModule(programModule(1));

    expect(() => program.addModule(programModule(1))).toThrow(
      "already exists in Program",
    );
  });

  it("adds entrypoints for owned modules", () => {
    const program = new Program();
    const module = programModule(1);

    program.addModule(module);
    program.addEntrypoint(module);

    expect(program.entrypoints).toEqual([module]);
  });

  it("rejects entrypoints not owned by the program", () => {
    const program = new Program();
    const module = programModule(1);

    expect(() => program.addEntrypoint(module)).toThrow(
      "does not belong to this program",
    );
  });

  it("rejects duplicate entrypoints", () => {
    const program = new Program();
    const module = programModule(1);

    program.addModule(module);
    program.addEntrypoint(module);

    expect(() => program.addEntrypoint(module)).toThrow(
      "already an entrypoint",
    );
  });

  it("looks up modules by id", () => {
    const program = new Program();
    const module = programModule(1);

    program.addModule(module);

    expect(program.getModule(makeModuleId(1))).toBe(module);
  });

  it("adds dependencies between owned modules", () => {
    const program = new Program();
    const from = programModule(1);
    const to = programModule(2);

    program.addModule(from);
    program.addModule(to);

    const dependency = {
      kind: "static-import",
      from,
      to,
      specifier: "./dep.js",
    } as const;

    program.addDependency(dependency);

    expect(program.dependencies).toEqual([dependency]);
    expect(program.dependenciesFrom(from)).toEqual([dependency]);
    expect(program.dependenciesTo(to)).toEqual([dependency]);
  });

  it("rejects dependency from an unowned module", () => {
    const program = new Program();
    const from = programModule(1);
    const to = programModule(2);

    program.addModule(to);

    expect(() =>
      program.addDependency({
        kind: "static-import",
        from,
        to,
        specifier: "./dep.js",
      }),
    ).toThrow("does not belong to this program");
  });

  it("rejects dependency to an unowned module", () => {
    const program = new Program();
    const from = programModule(1);
    const to = programModule(2);

    program.addModule(from);

    expect(() =>
      program.addDependency({
        kind: "static-import",
        from,
        to,
        specifier: "./dep.js",
      }),
    ).toThrow("does not belong to this program");
  });
});
