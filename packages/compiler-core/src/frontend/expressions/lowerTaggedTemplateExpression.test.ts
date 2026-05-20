import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { TaggedTemplateOp } from "../../ir/ops/calls/TaggedTemplateOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerTaggedTemplateExpression", () => {
  it("lowers tagged template expressions", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "tag`hello ${name}`;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "TaggedTemplateOp",
    ]);
    expect(operations[2]).toBeInstanceOf(TaggedTemplateOp);
    expect((operations[2] as TaggedTemplateOp).quasis).toEqual([
      { raw: "hello ", cooked: "hello ", tail: false },
      { raw: "", cooked: "", tail: true },
    ]);
  });

  it("preserves receiver semantics for member tags", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "obj.tag`x`;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const tagged = operations[1] as TaggedTemplateOp;

    expect(tagged.target).toEqual({
      kind: "property",
      object: operations[0].result,
      key: { kind: "static", name: "tag" },
    });
  });
});
