import _generate from "@babel/generator";
import * as t from "@babel/types";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import {
  DeclareLocalInstruction,
  BlockId,
  type ControlContext,
  DeclarationId,
  PlaceId,
} from "../ir";
import { FunctionIR, makeFunctionIRId } from "../ir/core/FunctionIR";
import { ModuleIR } from "../ir/core/ModuleIR";
import { generateFunction } from "./codegen/generateFunction";
import { generateDeclareLocalInstruction } from "./codegen/instructions/memory/generateDeclareLocal";

const generate =
  typeof _generate === "function"
    ? _generate
    : (_generate as unknown as { default: typeof _generate }).default;

/**
 * Generates the code from the IR.
 */
export class CodeGenerator {
  public readonly places: Map<PlaceId, t.Node | null> = new Map();
  public readonly blockToStatements: Map<BlockId, Array<t.Statement>> = new Map();
  public generatedBlocks: Set<BlockId> = new Set();
  public readonly controlStack: ControlContext[] = [];

  /** Maps declarationId → kind from DeclareLocal instructions. */
  public readonly declarationKinds: Map<DeclarationId, "var" | "let" | "const"> = new Map();
  /** Tracks which declarations have already emitted their first variable statement. */
  public readonly declaredDeclarations: Set<DeclarationId> = new Set();

  /**
   * Returns the label to use for a `break` statement targeting the given block.
   * - `undefined` if the block is not a break target at all
   * - `null` if it's the innermost break target (plain `break`)
   * - A label string if targeting an outer labeled context (`break label`)
   */
  public getBreakLabel(blockId: BlockId): string | null | undefined {
    const innermostIdx = this.controlStack.length - 1;
    if (innermostIdx >= 0 && this.controlStack[innermostIdx].breakTarget === blockId) {
      // Labeled blocks (kind: "label") always require an explicit label
      // because bare `break` is only valid inside loops and switches.
      if (this.controlStack[innermostIdx].kind === "label") {
        return this.controlStack[innermostIdx].label ?? null;
      }
      return null;
    }
    for (let i = this.controlStack.length - 2; i >= 0; i--) {
      if (this.controlStack[i].breakTarget === blockId) {
        // A non-innermost context requires a label; without one, bare
        // `break` would incorrectly target the innermost context.
        // Return undefined (not a valid break target) to fall through
        // to block inlining.
        return this.controlStack[i].label ?? undefined;
      }
    }
    return undefined;
  }

  /**
   * Returns the label to use for a `continue` statement targeting the given block.
   * - `undefined` if the block is not a continue target at all
   * - `null` if it's the innermost loop's continue target (plain `continue`)
   * - A label string if targeting an outer labeled loop (`continue label`)
   */
  public getContinueLabel(blockId: BlockId): string | null | undefined {
    // Find the innermost loop — only loops have continue targets.
    let innermostLoop: Extract<ControlContext, { kind: "loop" }> | undefined;
    for (let i = this.controlStack.length - 1; i >= 0; i--) {
      const ctx = this.controlStack[i];
      if (ctx.kind === "loop") {
        innermostLoop = ctx;
        break;
      }
    }
    if (innermostLoop && innermostLoop.continueTarget === blockId) {
      return null;
    }
    for (let i = this.controlStack.length - 1; i >= 0; i--) {
      const ctx = this.controlStack[i];
      if (ctx.kind === "loop" && ctx.continueTarget === blockId) {
        // Same reasoning as getBreakLabel: outer contexts need a label.
        return ctx.label ?? undefined;
      }
    }
    return undefined;
  }

  constructor(
    public readonly path: string,
    public readonly projectUnit: ProjectUnit,
  ) {}

  public get entryFunction(): FunctionIR {
    const moduleIR = this.projectUnit.modules.get(this.path)!;
    return moduleIR.functions.get(makeFunctionIRId(0))!;
  }

  generate(): string {
    const moduleIR = this.projectUnit.modules.get(this.path)!;
    this.preRegisterBindingIdentifiers(moduleIR);
    const { statements } = generateFunction(this.entryFunction, [], this);
    const program = t.program(statements);
    return generate(program).code;
  }

  /**
   * Generates code for a specific module in the project. Creates a fresh
   * CodeGenerator instance so per-module state (places, blocks) is isolated.
   */
  generateModule(modulePath: string): string {
    const moduleIR = this.projectUnit.modules.get(modulePath);
    if (!moduleIR) {
      throw new Error(`Module not found: ${modulePath}`);
    }

    const generator = new CodeGenerator(modulePath, this.projectUnit);
    generator.preRegisterBindingIdentifiers(moduleIR);
    const entryFunction = moduleIR.functions.get(makeFunctionIRId(0))!;
    const { statements } = generateFunction(entryFunction, [], generator);
    const program = t.program(statements);
    return generate(program).code;
  }

  /**
   * Pre-registers all binding identifiers from every function in the module.
   * This ensures cross-function closure references (where a closure in one
   * function references a variable declared in a sibling function) can always
   * resolve the binding's place, regardless of function generation order.
   */
  private preRegisterBindingIdentifiers(moduleIR: ModuleIR): void {
    for (const [, functionIR] of moduleIR.functions) {
      for (const instruction of functionIR.header) {
        if (instruction instanceof DeclareLocalInstruction) {
          generateDeclareLocalInstruction(instruction, this);
        }
      }
      for (const [, block] of functionIR.blocks) {
        for (const instruction of block.instructions) {
          if (instruction instanceof DeclareLocalInstruction) {
            generateDeclareLocalInstruction(instruction, this);
          }
        }
      }
    }
  }
}
