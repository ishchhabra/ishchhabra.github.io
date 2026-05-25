import { parseSync, Program } from "oxc-parser";

/**
 * Parses one JavaScript module.
 *
 * Parsing is kept outside IR builders so builders receive syntax trees and do
 * not own file IO, parser options, or parse diagnostics.
 */
export function parseModule(sourceName: string, source: string): Program {
  const result = parseSync(sourceName, source, {
    sourceType: "module",
    astType: "ts",
  });

  if (result.errors.length > 0) {
    throw new SyntaxError(result.errors.map((error) => error.message).join("\n"));
  }

  return result.program;
}
