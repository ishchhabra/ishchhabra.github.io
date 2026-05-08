import { parseModule } from "../parse/parseModule";

export function expressionFromSource(source: string) {
  const program = parseModule("test.js", `${source};`);
  const statement = program.body[0];

  if (statement?.type !== "ExpressionStatement") {
    throw new Error("Expected expression statement");
  }

  return statement.expression;
}
