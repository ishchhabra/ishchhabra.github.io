import { FunctionIR } from "./core/FunctionIR";
import { ModuleIR } from "./core/ModuleIR";

export function printFunctionIR(functionIR: FunctionIR, indent = ""): string {
  const lines: string[] = [];

  if (functionIR.source.header.length > 0) {
    lines.push(`${indent}source.header:`);
    for (const instr of functionIR.source.header) {
      lines.push(`${indent}  ${instr.print()}`);
    }
  }

  if (functionIR.runtime.prologue !== functionIR.source.header && functionIR.runtime.prologue.length > 0) {
    lines.push(`${indent}runtime.prologue:`);
    for (const instr of functionIR.runtime.prologue) {
      lines.push(`${indent}  ${instr.print()}`);
    }
  }

  if (functionIR.phis.size > 0) {
    lines.push(`${indent}phis:`);
    for (const phi of functionIR.phis) {
      const operands = [...phi.operands.entries()]
        .map(([blockId, place]) => `bb${blockId}:${place.print()}`)
        .join(", ");
      lines.push(`${indent}  ${phi.place.print()} = phi(${operands})`);
    }
  }

  for (const [blockId, block] of functionIR.blocks) {
    lines.push(`${indent}bb${blockId}:`);
    for (const instr of block.instructions) {
      lines.push(`${indent}  ${instr.print()}`);
    }
    if (block.terminal) {
      lines.push(`${indent}  ${block.terminal.print()}`);
    }
  }

  return lines.join("\n");
}

export function printModuleIR(moduleIR: ModuleIR): string {
  const lines: string[] = [];
  for (const [id, funcIR] of moduleIR.functions) {
    const params = funcIR.source.params.map((p) => p.print()).join(", ");
    const prefix = funcIR.async ? "async " : "";
    const suffix = funcIR.generator ? "*" : "";
    lines.push(`fn${id}${suffix}(${params}) ${prefix}{`);
    lines.push(printFunctionIR(funcIR, "  "));
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
