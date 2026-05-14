import base from "../../oxfmt.base.json" with { type: "json" };

export default {
  ...base,
  ignorePatterns: ["dist", "src/routeTree.gen.ts", "drizzle"],
};
