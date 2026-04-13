/**
 * MLIR-style textual IR printer (step #5).
 *
 * Produces a human-readable, round-trippable-in-spirit dump of a
 * {@link FunctionIR} or {@link ModuleIR}. The grammar mirrors MLIR's
 * generic assembly form closely enough for debugging and diffing —
 * e.g. React Compiler's `printHIR`, LLVM's `-print-after-all`, or
 * `mlir-opt` dumps — but is not a formal language. There is no
 * corresponding parser; the textual form is a one-way view of the
 * in-memory IR.
 *
 * Output layout for a module:
 *
 * ```
 * module {
 *   fn0 "main"(x: %1, y: %2) {
 *     source.header:
 *       ...
 *     runtime.prologue:
 *       ...
 *     phis:
 *       %3 = phi(bb1: %4, bb2: %5)
 *     bb0:                                  ; scope=0
 *       %6 = ...
 *       jump bb1
 *     bb1:                                  ; scope=1
 *       ...
 *       return %6
 *     structures:
 *       bb0 -> ForOfOp { ... }
 *   }
 * }
 * ```
 *
 * Differences from the previous minimal printer:
 *
 *   - Module wrapper (`module { ... }`) and per-function signature with
 *     async/generator modifiers and param destructure targets.
 *   - Block headers carry scope annotation and block-arg lists when
 *     populated (step #10 infrastructure).
 *   - Structures are dumped under the containing function so the
 *     structured-CF overlay is visible.
 *   - Everything is indented consistently by two spaces per level.
 */

import { printDestructureTarget } from "./core/Destructure";
import { FunctionIR } from "./core/FunctionIR";
import { ModuleIR } from "./core/ModuleIR";

const INDENT = "  ";

function push(lines: string[], depth: number, line: string): void {
  lines.push(`${INDENT.repeat(depth)}${line}`);
}

export function printFunctionIR(functionIR: FunctionIR, depth = 0): string {
  const lines: string[] = [];
  printFunctionIRInto(functionIR, lines, depth);
  return lines.join("\n");
}

function printFunctionIRInto(functionIR: FunctionIR, lines: string[], depth: number): void {
  if (functionIR.source.header.length > 0) {
    push(lines, depth, "source.header:");
    for (const instr of functionIR.source.header) {
      push(lines, depth + 1, instr.print());
    }
  }

  const prologue = functionIR.runtime.prologue;
  if (prologue !== functionIR.source.header && prologue.length > 0) {
    push(lines, depth, "runtime.prologue:");
    for (const instr of prologue) {
      push(lines, depth + 1, instr.print());
    }
  }

  if (functionIR.phis.size > 0) {
    push(lines, depth, "phis:");
    for (const phi of functionIR.phis) {
      const operands = [...phi.operands.entries()]
        .map(([blockId, place]) => `bb${blockId}: ${place.print()}`)
        .join(", ");
      push(lines, depth + 1, `${phi.place.print()} = phi(${operands})`);
    }
  }

  for (const block of functionIR.allBlocks()) {
    const header = `bb${block.id}:`;
    const scopeAnnotation = `; scope=${block.scopeId}`;
    push(lines, depth, `${header.padEnd(24, " ")}${scopeAnnotation}`);

    // MLIR-style: terminator is the last op; getAllOps yields instructions
    // followed by the terminator in program order.
    for (const op of block.getAllOps()) {
      push(lines, depth + 1, op.print());
    }
  }

  const structures = functionIR.structures;
  if (structures.size > 0) {
    push(lines, depth, "structures:");
    for (const [blockId, structure] of structures) {
      push(lines, depth + 1, `bb${blockId} -> ${structure.print()}`);
    }
  }
}

export function printModuleIR(moduleIR: ModuleIR): string {
  const lines: string[] = [];
  lines.push("module {");
  for (const [id, funcIR] of moduleIR.functions) {
    const params = funcIR.source.params.map((p) => printDestructureTarget(p)).join(", ");
    const modifiers: string[] = [];
    if (funcIR.async) modifiers.push("async");
    if (funcIR.generator) modifiers.push("generator");
    const modStr = modifiers.length > 0 ? `${modifiers.join(" ")} ` : "";
    push(lines, 1, `${modStr}fn${id}(${params}) {`);
    printFunctionIRInto(funcIR, lines, 2);
    push(lines, 1, "}");
  }
  lines.push("}");
  return lines.join("\n");
}
