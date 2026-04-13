import _generate from "@babel/generator";
import * as t from "@babel/types";
import { ProjectUnit } from "../frontend/ProjectBuilder";
import {
  BlockId,
  type ControlContext,
  DeclarationId,
  FunctionDeclarationOp,
  getCodegenDeclarationKind,
  Place,
  PlaceId,
  LexicalScope,
  type LexicalScopeId,
} from "../ir";
import { FunctionIR, makeFunctionIRId } from "../ir/core/FunctionIR";
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

  public readonly places: Map<PlaceId, t.Node | null> = new Map();
  public readonly declarationIdentifiers: Map<DeclarationId, t.Identifier> = new Map();
  public blockToStatements: Map<BlockId, Array<t.Statement>> = new Map();
  public generatedBlocks: Set<BlockId> = new Set();
  public readonly controlStack: ControlContext[] = [];
  public readonly scopes: Map<LexicalScopeId, LexicalScope> = new Map();

  /** Tracks which declarations have already emitted their first variable statement. */
  public declaredDeclarations: Set<DeclarationId> = new Set();

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

  public get entryFunction(): FunctionIR {
    return this.moduleIR.functions.get(makeFunctionIRId(0))!;
  }

  public getDeclarationMetadata(declarationId: DeclarationId) {
    return this.moduleIR.environment.getDeclarationMetadata(declarationId);
  }

  /** Loop nest and back-edge classification (LLVM-style {@link LoopInfo}). */
  getLoopInfo(functionIR: FunctionIR): LoopInfo {
    return this.analysisManager.get(LoopInfoAnalysis, functionIR);
  }

  public getPlaceIdentifier(place: Place): t.Identifier {
    const existing = this.places.get(place.id);
    if (existing && t.isIdentifier(existing)) {
      return existing;
    }
    if (existing && t.isFunctionDeclaration(existing) && existing.id) {
      this.places.set(place.id, existing.id);
      return existing.id;
    }
    if (existing && t.isClassDeclaration(existing) && existing.id) {
      this.places.set(place.id, existing.id);
      return existing.id;
    }

    const metadata = this.getDeclarationMetadata(place.identifier.declarationId);
    const aliasableDeclaration =
      metadata !== undefined && getCodegenDeclarationKind(metadata.kind) !== undefined;
    const existingDeclarationIdentifier = aliasableDeclaration
      ? this.declarationIdentifiers.get(place.identifier.declarationId)
      : undefined;
    if (existingDeclarationIdentifier) {
      this.places.set(place.id, existingDeclarationIdentifier);
      return existingDeclarationIdentifier;
    }

    const name = place.identifier.name;
    const identifier = t.identifier(name);
    if (aliasableDeclaration) {
      this.declarationIdentifiers.set(place.identifier.declarationId, identifier);
    }
    this.places.set(place.id, identifier);
    return identifier;
  }

  generate(): string {
    // Populate the scope tree so the codegen can detect scope transitions.
    for (const [id, scope] of this.moduleIR.environment.scopes) {
      this.scopes.set(id, scope);
    }
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
    for (const [id, scope] of moduleIR.environment.scopes) {
      generator.scopes.set(id, scope);
    }
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
    for (const [declarationId, metadata] of moduleIR.environment.declarationMetadata) {
      if (metadata.bindingPlaceId === undefined) {
        continue;
      }
      const place = moduleIR.environment.places.get(metadata.bindingPlaceId);
      if (place === undefined) {
        continue;
      }
      const identifier = t.identifier(place.identifier.name);
      if (getCodegenDeclarationKind(metadata.kind) !== undefined) {
        this.declarationIdentifiers.set(declarationId, identifier);
      }
      this.places.set(place.id, identifier);
      if (metadata.kind === "param" || metadata.kind === "import" || metadata.kind === "catch") {
        this.declaredDeclarations.add(declarationId);
      }
    }

    for (const [, functionIR] of moduleIR.functions) {
      for (const instruction of functionIR.source.header) {
        if (instruction instanceof FunctionDeclarationOp) {
          this.places.set(instruction.place.id, this.getPlaceIdentifier(instruction.place));
        }
      }
    }
  }
}
