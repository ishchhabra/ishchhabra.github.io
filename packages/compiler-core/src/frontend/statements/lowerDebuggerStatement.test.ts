import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { DebuggerOp } from "../../ir/ops/debugger/DebuggerOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerDebuggerStatement", () => {
  it("lowers debugger statements to observable ops", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "debugger;"),
    );

    const op = moduleIR.entryFunction?.entryBlock.operations[0];

    expect(op).toBeInstanceOf(DebuggerOp);
  });
});
