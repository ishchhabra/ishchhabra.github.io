import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { DeleteOp } from "../../ir/ops/operators/DeleteOp";
import { UnaryOp } from "../../ir/ops/operators/UnaryOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerUnaryExpression", () => {
  it("lowers the argument before the unary operation", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "!true;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["ConstantOp", "UnaryOp"]);

    const argument = operations[0] as ConstantOp;
    const unary = operations[1] as UnaryOp;

    expect(argument.value).toBe(true);
    expect(unary.operator).toBe("!");
    expect(unary.argument).toBe(argument.result);
  });

  it("lowers property delete without loading the property", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "delete obj.x;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual(["LoadGlobalOp", "DeleteOp"]);
    expect(operations[1]).toBeInstanceOf(DeleteOp);
  });
});
