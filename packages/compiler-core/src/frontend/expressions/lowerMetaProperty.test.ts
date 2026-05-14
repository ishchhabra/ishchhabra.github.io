import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { MetaPropertyOp } from "../../ir/ops/functions/MetaPropertyOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerMetaProperty", () => {
  it("lowers import.meta", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const url = import.meta.url;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "MetaPropertyOp",
      "LoadPropertyOp",
      "InitializeBindingOp",
    ]);

    const meta = operations[0] as MetaPropertyOp;
    expect(meta.kind).toEqual({ meta: "import", property: "meta" });
  });

  it("lowers new.target", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "function f() { return new.target; }"),
    );
    const fn = moduleIR.functions.find((candidate) => candidate.parentFunction !== null);
    if (fn === undefined) throw new Error("Expected function f");

    const operations = fn.entryBlock.operations;
    expect(operations.map((op) => op.constructor.name)).toEqual([
      "MetaPropertyOp",
      "ReturnTerminatorOp",
    ]);

    const meta = operations[0] as MetaPropertyOp;
    expect(meta.kind).toEqual({ meta: "new", property: "target" });
  });
});
