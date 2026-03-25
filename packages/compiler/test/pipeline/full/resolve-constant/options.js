import { getQualifiedName } from "../../../../src/pipeline/passes/resolveConstant.ts";

const defines = {
  "__DEV__": false,
  "process.env.NODE_ENV": "production",
};

export default {
  resolveConstant(instruction, ctx) {
    const name = getQualifiedName(instruction, ctx.environment);
    if (name !== undefined && name in defines) {
      ctx.set(defines[name]);
    }
  },
};
