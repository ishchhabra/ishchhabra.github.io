import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { CreateClassOp } from "../../ir/ops/classes/CreateClassOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import { HasPrivateNameOp } from "../../ir/ops/properties/HasPrivateNameOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerBinaryExpression", () => {
  it("lowers operands before the binary operation", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "1 + 2;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ConstantOp",
      "BinaryOp",
    ]);

    const left = operations[0] as ConstantOp;
    const right = operations[1] as ConstantOp;
    const binary = operations[2] as BinaryOp;

    expect(left.value).toBe(1);
    expect(right.value).toBe(2);
    expect(binary.operator).toBe("+");
    expect(binary.left).toBe(left.result);
    expect(binary.right).toBe(right.result);
  });

  it("preserves nested binary evaluation order", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "1 + 2 * 3;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "ConstantOp",
      "ConstantOp",
      "ConstantOp",
      "BinaryOp",
      "BinaryOp",
    ]);

    const multiply = operations[3] as BinaryOp;
    const add = operations[4] as BinaryOp;

    expect(multiply.operator).toBe("*");
    expect(add.operator).toBe("+");
    expect(add.right).toBe(multiply.result);
  });

  it("lowers private-name brand checks", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "class C { #x; method(other) { return #x in other; } }"),
    );
    const classOp = moduleIR.entryFunction?.entryBlock.operations[0] as CreateClassOp;
    const operations = classOp.elements[1].functionIR.entryBlock.operations;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadBindingOp",
      "HasPrivateNameOp",
      "ReturnTerminatorOp",
    ]);

    const has = operations[1] as HasPrivateNameOp;
    expect(has.name.name).toBe("x");
    expect(has.object).toBe(operations[0].result);
  });
});
