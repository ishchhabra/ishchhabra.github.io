/**
 * MLIR-style textual IR printer (step #5).
 *
 * Produces a human-readable, round-trippable-in-spirit dump of a
 * {@link FuncOp} or {@link ModuleIR}. The grammar mirrors MLIR's
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
import { FuncOp } from "./core/FuncOp";
import { ModuleIR } from "./core/ModuleIR";

const INDENT = "  ";

function push(lines: string[], depth: number, line: string): void {
  lines.push(`${INDENT.repeat(depth)}${line}`);
}

export function printFuncOp(funcOp: FuncOp, depth = 0): string {
  const lines: string[] = [];
  printFuncOpInto(funcOp, lines, depth);
  return lines.join("\n");
}

function printFuncOpInto(funcOp: FuncOp, lines: string[], depth: number): void {
  if (funcOp.prologue.length > 0) {
    push(lines, depth, "prologue:");
    for (const instr of funcOp.prologue) {
      push(lines, depth + 1, instr.print());
    }
  }

  for (const block of funcOp.allBlocks()) {
    const paramsAnnotation =
      block.params.length > 0 ? `(${block.params.map((p) => p.print()).join(", ")})` : "";
    const header = `bb${block.id}${paramsAnnotation}:`;
    push(lines, depth, header);

    // MLIR-style: `getAllOps` yields regular instructions, then the
    // structured op (if any), then the terminator (if any), all in
    // program order — a single uniform walk.
    for (const op of block.getAllOps()) {
      push(lines, depth + 1, op.print());
    }
  }
}

export function printModuleIR(moduleIR: ModuleIR): string {
  const lines: string[] = [];
  lines.push("module {");
  for (const [id, funcIR] of moduleIR.functions) {
    const params = funcIR.paramPatterns.map((p) => printDestructureTarget(p)).join(", ");
    const modifiers: string[] = [];
    if (funcIR.async) modifiers.push("async");
    if (funcIR.generator) modifiers.push("generator");
    const modStr = modifiers.length > 0 ? `${modifiers.join(" ")} ` : "";
    push(lines, 1, `${modStr}fn${id}(${params}) {`);
    printFuncOpInto(funcIR, lines, 2);
    push(lines, 1, "}");
  }
  lines.push("}");
  return lines.join("\n");
}
