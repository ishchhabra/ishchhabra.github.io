import _generate from "@babel/generator";
import * as t from "@babel/types";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import {
  BlockId,
  type ControlContext,
  DeclarationId,
  FunctionDeclarationOp,
  getCodegenDeclarationKind,
  Value,
  ValueId,
} from "../ir";
import { FuncOp } from "../ir/core/FuncOp";
import { ModuleIR } from "../ir/core/ModuleIR";
import { AnalysisManager } from "../pipeline/analysis/AnalysisManager";
import { LoopInfo, LoopInfoAnalysis } from "../pipeline/analysis/LoopInfoAnalysis";
import { generateFunction } from "./codegen/generateFunction";

const generate =
  typeof _generate === "function"
    ? _generate
    : (_generate as unknown as { default: typeof _generate }).default;

interface FunctionCodegenState {
  generatedBlocks: Set<BlockId>;
  blockToStatements: Map<BlockId, Array<t.Statement>>;
  declaredDeclarations: Set<DeclarationId>;
}

/**
 * Generates the code from the IR.
 */
export class CodeGenerator {
  /** Lazily caches analyses for nested functions during codegen (mirrors pipeline `AnalysisManager`). */
  public readonly analysisManager = new AnalysisManager();

  public readonly values: Map<ValueId, t.Node | null> = new Map();
  public readonly declarationIdentifiers: Map<DeclarationId, t.Identifier> = new Map();
  public blockToStatements: Map<BlockId, Array<t.Statement>> = new Map();
  public generatedBlocks: Set<BlockId> = new Set();
  public readonly controlStack: ControlContext[] = [];

  /**
   * Stack of block ids that are the "fallthrough" target of an
   * enclosing structured terminator (IfTerm/WhileTerm/ForTerm/
   * ForOfTerm/ForInTerm/TryTerm/SwitchTerm/LabeledTerm). A `JumpOp`
   * whose target is in this set emits no statements — the
   * terminator's emitter is responsible for placing the fallthrough
   * block's statements after the structured JS statement.
   */
  public readonly structuredFallthroughStack: BlockId[] = [];

  /** Tracks which declarations have already emitted their first variable statement. */
  public declaredDeclarations: Set<DeclarationId> = new Set();

  /**
   * Memoized declaration AST per `FunctionDeclarationOp` /
   * `ClassDeclarationOp`. Implementation detail of those ops'
   * codegen functions — they are idempotent, calling them twice on
   * the same op returns the same AST node.
   *
   * Not a side-channel lookup map: consumers don't read this
   * directly. They walk the def-use edge (`Value.definer`) to find
   * the producing op and call its codegen function, which returns
   * the cached AST. Matches MLIR's `value->getDefiningOp()` pattern.
   */
  public readonly declarationAstCache = new Map<
    unknown,
    t.FunctionDeclaration | t.ClassDeclaration
  >();

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

  public get moduleIR(): ModuleIR {
    return this.projectUnit.modules.get(this.path)!;
  }

  public get entryFunction(): FuncOp {
    const entry = this.moduleIR.entryFuncOp;
    if (entry === undefined) {
      throw new Error(`CodeGenerator: module ${this.path} has no entry function`);
    }
    return entry;
  }

  public getDeclarationMetadata(declarationId: DeclarationId) {
    return this.moduleIR.environment.getDeclarationMetadata(declarationId);
  }

  /** Loop nest and back-edge classification (LLVM-style {@link LoopInfo}). */
  getLoopInfo(funcOp: FuncOp): LoopInfo {
    return this.analysisManager.get(LoopInfoAnalysis, funcOp);
  }

  public getPlaceIdentifier(place: Value): t.Identifier {
    const existing = this.values.get(place.id);
    if (existing && t.isIdentifier(existing)) {
      return existing;
    }
    if (existing && t.isFunctionDeclaration(existing) && existing.id) {
      this.values.set(place.id, existing.id);
      return existing.id;
    }
    if (existing && t.isClassDeclaration(existing) && existing.id) {
      this.values.set(place.id, existing.id);
      return existing.id;
    }

    const metadata = this.getDeclarationMetadata(place.declarationId);
    const aliasableDeclaration =
      metadata !== undefined && getCodegenDeclarationKind(metadata.kind) !== undefined;
    const existingDeclarationIdentifier = aliasableDeclaration
      ? this.declarationIdentifiers.get(place.declarationId)
      : undefined;
    if (existingDeclarationIdentifier) {
      this.values.set(place.id, existingDeclarationIdentifier);
      return existingDeclarationIdentifier;
    }

    const name = place.name;
    const identifier = t.identifier(name);
    if (aliasableDeclaration) {
      this.declarationIdentifiers.set(place.declarationId, identifier);
    }
    this.values.set(place.id, identifier);
    return identifier;
  }

  generate(): string {
    this.preRegisterBindingIdentifiers(this.moduleIR);
    const { statements } = generateFunction(this.entryFunction, [], this);
    const program = t.program(statements);
    return generate(program).code;
  }

  /**
   * Runs codegen with a fresh per-function state frame. Nested function
   * generation reuses module-wide bindings/places but must not share block
   * visitation or "first declaration emitted" bookkeeping with the caller.
   */
  public withFunctionState<T>(fn: () => T): T {
    const savedState: FunctionCodegenState = {
      generatedBlocks: this.generatedBlocks,
      blockToStatements: this.blockToStatements,
      declaredDeclarations: this.declaredDeclarations,
    };

    this.generatedBlocks = new Set();
    this.blockToStatements = new Map();
    this.declaredDeclarations = new Set();

    try {
      return fn();
    } finally {
      this.generatedBlocks = savedState.generatedBlocks;
      this.blockToStatements = savedState.blockToStatements;
      this.declaredDeclarations = savedState.declaredDeclarations;
    }
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
    const entryFunction = moduleIR.entryFuncOp;
    if (entryFunction === undefined) {
      throw new Error(`CodeGenerator: module ${modulePath} has no entry function`);
    }
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
    for (const [declarationId, metadata] of moduleIR.environment.declarationMetadata) {
      const place = metadata.bindingValue;
      if (place === undefined) {
        continue;
      }
      const identifier = t.identifier(place.name);
      if (getCodegenDeclarationKind(metadata.kind) !== undefined) {
        this.declarationIdentifiers.set(declarationId, identifier);
      }
      this.values.set(place.id, identifier);
      if (metadata.kind === "param" || metadata.kind === "import" || metadata.kind === "catch") {
        this.declaredDeclarations.add(declarationId);
      }
    }

    for (const [, funcOp] of moduleIR.functions) {
      for (const instruction of funcOp.header) {
        if (instruction instanceof FunctionDeclarationOp) {
          this.values.set(instruction.place.id, this.getPlaceIdentifier(instruction.place));
        }
      }
    }
  }
}
