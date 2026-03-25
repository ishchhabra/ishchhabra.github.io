import { LoadGlobalInstruction } from "../../../../../../src/ir/index.ts";
import { getQualifiedName } from "../../../../../../src/pipeline/passes/resolveConstant.ts";

export default {
  resolveConstant(instruction, ctx) {
    const name = getQualifiedName(instruction, ctx.environment);
    if (name === "process.env.NODE_ENV") {
      ctx.set("production");
    }
    if (instruction instanceof LoadGlobalInstruction && instruction.name === "__DEV__") {
      ctx.set(false);
    }
  },
};
