import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { JSXElementOp } from "../../ir/ops/jsx/JSXElementOp";
import { JSXFragmentOp } from "../../ir/ops/jsx/JSXFragmentOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerJSXExpression", () => {
  it("lowers intrinsic elements without binding tag names", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.jsx", 'const el = <div id="root">hello</div>;'),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const element = operations[0] as JSXElementOp;

    expect(element).toBeInstanceOf(JSXElementOp);
    expect(element.name).toEqual({ kind: "intrinsic", name: "div" });
    expect(element.attributes).toEqual([
      {
        kind: "attribute",
        name: { kind: "intrinsic", name: "id" },
        value: { kind: "string", value: "root" },
      },
    ]);
    expect(element.children).toEqual([{ kind: "text", value: "hello" }]);
  });

  it("exposes component and member roots as operands", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.jsx", "const el = <UI.Button>{name}</UI.Button>;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const element = operations[2] as JSXElementOp;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "JSXElementOp",
      "InitializeBindingOp",
    ]);
    expect(element.name).toMatchObject({
      kind: "member",
      object: { kind: "reference", sourceName: "UI" },
      property: "Button",
    });
    expect(element.operands()).toEqual([operations[0].result, operations[1].result]);
  });

  it("lowers fragments and nested JSX nodes", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.jsx", "const el = <><span />{child}</>;"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const fragment = operations[2] as JSXFragmentOp;

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "JSXElementOp",
      "LoadGlobalOp",
      "JSXFragmentOp",
      "InitializeBindingOp",
    ]);
    expect(fragment.children).toEqual([
      { kind: "node", value: operations[0].result },
      { kind: "expression", value: operations[1].result },
    ]);
  });
});
