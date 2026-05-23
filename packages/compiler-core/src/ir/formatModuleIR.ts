import { BasicBlock } from "./core/Block";
import { FunctionIR, type FunctionParam } from "./core/FunctionIR";
import { ModuleIR } from "./core/ModuleIR";
import { Operation } from "./core/Operation";
import { successorValues, type BlockTarget } from "./core/TerminatorOp";
import { Value } from "./core/Value";

const IGNORED_OBJECT_KEYS = new Set([
  "id",
  "results",
  "ownerBlock",
  "ownerFunction",
  "ownerModule",
  "parentFunction",
]);

export function formatModuleIR(moduleIR: ModuleIR): string {
  const lines = [`module #${moduleIR.id} {`];

  for (const record of moduleIR.imports) {
    lines.push(`  import ${formatUnknown(record)}`);
  }

  for (const record of moduleIR.exports) {
    lines.push(`  export ${formatUnknown(record)}`);
  }

  for (const fn of moduleIR.functions) {
    lines.push(indent(formatFunctionIR(fn), "  "));
  }

  lines.push("}");
  return lines.join("\n");
}

export function formatFunctionIR(fn: FunctionIR): string {
  const flags = [fn.isAsync ? "async" : null, fn.isGenerator ? "generator" : null, fn.kind].filter(
    (flag) => flag !== null,
  );
  const params = fn.params.map(formatFunctionParam).join(", ");
  const lines = [`function #${fn.id} ${flags.join(" ")}(${params}) {`];

  for (const block of fn.blocks) {
    lines.push(indent(formatBlock(block), "  "));
  }

  lines.push("}");
  return lines.join("\n");
}

function formatBlock(block: BasicBlock): string {
  const params = block.params.map(formatValue).join(", ");
  const kind = block.kind === "default" ? "" : ` ${block.kind}`;
  const lines = [`bb${block.id}${kind}(${params}):`];

  if (block.operations.length === 0) {
    lines.push("  <empty>");
    return lines.join("\n");
  }

  for (const op of block.operations) {
    lines.push(`  ${formatOperation(op)}`);
  }

  return lines.join("\n");
}

function formatOperation(op: Operation): string {
  const results = op.results.map(formatValue).join(", ");
  const prefix = results.length === 0 ? "" : `${results} = `;
  const attrs = formatObjectEntries(op)
    .map(([key, value]) => `${key}: ${formatUnknown(value, new Set([op]))}`)
    .join(", ");

  return `${prefix}${op.constructor.name}#${op.id}${attrs.length === 0 ? "" : `(${attrs})`}`;
}

function formatFunctionParam(param: FunctionParam): string {
  switch (param.kind) {
    case "argument":
      return `arg ${formatValue(param.value)} ${formatUnknown(param.target)}`;

    case "rest":
      return `rest ${formatValue(param.value)} ${formatUnknown(param.target)}`;

    case "capture":
      return `capture d${param.declarationId}`;
  }
}

function formatValue(value: Value): string {
  const declaration = value.declarationId === null ? "" : `{d${value.declarationId}}`;
  return `$${value.id}${declaration}`;
}

function formatBlockTarget(target: BlockTarget): string {
  const args = successorValues(target).map(formatValue).join(", ");
  return `bb${target.block.id}(${args})`;
}

function formatUnknown(value: unknown, seen = new Set<object>()): string {
  if (value instanceof Value) return formatValue(value);
  if (value instanceof BasicBlock) return `bb${value.id}`;
  if (value instanceof FunctionIR) return `function #${value.id}`;
  if (value instanceof ModuleIR) return `module #${value.id}`;
  if (isBlockTarget(value)) return formatBlockTarget(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatUnknown(item, seen)).join(", ")}]`;
  }

  switch (typeof value) {
    case "bigint":
      return `${value}n`;

    case "boolean":
    case "number":
      return String(value);

    case "function":
      return `[Function ${value.name || "anonymous"}]`;

    case "string":
      return JSON.stringify(value);

    case "undefined":
      return "undefined";

    case "object": {
      if (value === null) return "null";
      if (seen.has(value)) return "[Circular]";

      seen.add(value);
      const entries = formatObjectEntries(value)
        .map(([key, entryValue]) => `${key}: ${formatUnknown(entryValue, seen)}`)
        .join(", ");
      seen.delete(value);

      return `{ ${entries} }`;
    }

    case "symbol":
      return value.description === undefined ? value.toString() : `Symbol(${value.description})`;
  }
}

function formatObjectEntries(value: object): [string, unknown][] {
  return Object.entries(value).filter(([key]) => !IGNORED_OBJECT_KEYS.has(key));
}

function isBlockTarget(value: unknown): value is BlockTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "block" in value &&
    value.block instanceof BasicBlock &&
    "operands" in value
  );
}

function indent(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
