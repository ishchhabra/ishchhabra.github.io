import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { RegExpLiteralOp } from "../../ir/ops/literals/RegExpLiteralOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerLiteral", () => {
  it("lowers primitive literals to ConstantOp", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "1;"),
    );

    const op = moduleIR.entryFunction?.entryBlock.operations[0];

    expect(op).toBeInstanceOf(ConstantOp);
    expect((op as ConstantOp).value).toBe(1);
  });

  it("lowers RegExp literals to RegExpLiteralOp", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "/abc/gi;"),
    );

    const op = moduleIR.entryFunction?.entryBlock.operations[0];

    expect(op).toBeInstanceOf(RegExpLiteralOp);
    expect((op as RegExpLiteralOp).pattern).toBe("abc");
    expect((op as RegExpLiteralOp).flags).toBe("gi");
  });
});
