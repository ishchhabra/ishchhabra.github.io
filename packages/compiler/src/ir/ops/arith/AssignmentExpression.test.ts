import { describe, expect, it } from "vitest";
import { Environment } from "../../../environment";
import { ProjectEnvironment } from "../../../ProjectEnvironment";
import { ModuleIR } from "../../core/ModuleIR";
import { makeCloneContext } from "../../core/Operation";
import { AssignmentExpressionOp } from "./AssignmentExpression";

describe("AssignmentExpressionOp", () => {
  it("remaps target and value operands when cloned", () => {
    const env = new Environment(new ProjectEnvironment());
    const moduleIR = new ModuleIR("m.js", env);
    const object = env.createValue();
    const value = env.createValue();
    const remappedObject = env.createValue();
    const remappedValue = env.createValue();
    const op = env.createOperation(
      AssignmentExpressionOp,
      env.createValue(),
      "+=",
      {
        kind: "static-property",
        object,
        property: "x",
      },
      value,
    );
    const ctx = makeCloneContext(moduleIR);
    ctx.valueMap.set(object, remappedObject);
    ctx.valueMap.set(value, remappedValue);

    const clone = op.clone(ctx);

    expect(clone.value).toBe(remappedValue);
    expect(clone.target).toEqual({
      kind: "static-property",
      object: remappedObject,
      property: "x",
    });
  });
});
