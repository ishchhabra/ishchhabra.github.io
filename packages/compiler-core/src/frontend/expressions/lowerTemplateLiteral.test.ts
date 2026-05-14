import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { TemplateLiteralOp } from "../../ir/ops/literals/TemplateLiteralOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerTemplateLiteral", () => {
  it("lowers template literals", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const message = `hello ${name}`;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "TemplateLiteralOp",
      "InitializeBindingOp",
    ]);
    expect(operations[1]).toBeInstanceOf(TemplateLiteralOp);
    expect((operations[1] as TemplateLiteralOp).quasis).toEqual([
      { raw: "hello ", cooked: "hello ", tail: false },
      { raw: "", cooked: "", tail: true },
    ]);
  });
});
