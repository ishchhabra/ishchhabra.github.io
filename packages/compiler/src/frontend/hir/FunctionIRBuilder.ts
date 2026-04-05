import type * as ESTree from "estree";
import { Environment } from "../../environment";
import {
  BaseInstruction,
  BaseStructure,
  BasicBlock,
  BlockId,
  type ControlContext,
  createInstructionId,
  DeclarationId,
  Place,
  ReturnTerminal,
} from "../../ir";
import { FunctionIR, makeFunctionIRId } from "../../ir/core/FunctionIR";
import { isExpression, isTSOnlyNode } from "../estree";
import { type Scope, type ScopeMap } from "../scope/Scope";
import { instantiateScopeBindings } from "./bindings";
import { buildFunctionParams } from "./buildFunctionParams";
import { buildNode } from "./buildNode";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildStatementList } from "./statements/buildStatementList";

export type DeclarationKind =
  | "var"
  | "let"
  | "const"
  | "class"
  | "function"
  | "param"
  | "import"
  | "catch";

export type DeclarationState = "uninitialized" | "initialized";

export interface DeclarationBinding {
  kind: DeclarationKind;
  state: DeclarationState;
  sourceName: string;
}

export class FunctionIRBuilder {
  public currentBlock: BasicBlock;
  public readonly blocks: Map<BlockId, BasicBlock> = new Map();
  public readonly structures: Map<BlockId, BaseStructure> = new Map();
  public readonly header: BaseInstruction[] = [];
  public readonly controlStack: ControlContext[] = [];
  public readonly blockLabels: Map<BlockId, string> = new Map();

  /**
   * Places captured from enclosing scopes, keyed by DeclarationId to
   * avoid duplicates when the same variable is referenced multiple times.
   * Stored on the function instruction so that `getOperands()` exposes
   * them to optimization passes, preventing DCE from eliminating captured
   * variable definitions in the outer scope.
   */
  public readonly captures = new Map<DeclarationId, Place>();

  /**
   * Local places inside this function that correspond to each captured
   * variable. Aligned by key with `captures`: for each DeclarationId,
   * `captureParams.get(declId)` is the local Place that instructions in
   * this function's blocks use to reference the captured variable.
   *
   * This indirection decouples the function's blocks from the parent
   * scope's identifiers, so rewriting captures (e.g. during SSA or
   * inlining) never requires modifying the function's blocks.
   */
  public readonly captureParams = new Map<DeclarationId, Place>();
  public readonly declarationBindings = new Map<DeclarationId, DeclarationBinding>();

  constructor(
    public readonly params: ESTree.Pattern[],
    public readonly scopeNode: ESTree.Node,
    public readonly bodyNode: ESTree.Program | ESTree.BlockStatement | ESTree.Expression,
    public readonly scope: Scope,
    public readonly scopeMap: ScopeMap,
    public readonly environment: Environment,
    public readonly moduleBuilder: ModuleIRBuilder,
    public readonly async: boolean,
    public readonly generator: boolean,
  ) {
    const entryBlock = this.environment.createBlock();
    this.blocks.set(entryBlock.id, entryBlock);
    this.currentBlock = entryBlock;
  }

  /** Resolve the scope for a given AST node. */
  public scopeFor(node: ESTree.Node): Scope {
    return this.scopeMap.get(node) ?? this.scope;
  }

  public build(): FunctionIR {
    const builtParams = buildFunctionParams(
      this.params,
      this.scopeNode,
      this.bodyNode,
      this.scope,
      this,
      this.moduleBuilder,
      this.environment,
    );
    const params = builtParams.map((p) => p.place);
    const paramBindings = builtParams.map((p) => p.paramBindings);

    const functionId = makeFunctionIRId(this.environment.nextFunctionId++);

    if (isExpression(this.bodyNode) || isTSOnlyNode(this.bodyNode)) {
      const resultPlace = buildNode(
        this.bodyNode,
        this.scope,
        this,
        this.moduleBuilder,
        this.environment,
      );
      if (resultPlace !== undefined && !Array.isArray(resultPlace)) {
        this.currentBlock.terminal = new ReturnTerminal(
          createInstructionId(this.environment),
          resultPlace,
        );
      }
    } else {
      const bodyScope = this.scopeFor(this.bodyNode);
      instantiateScopeBindings(
        this.bodyNode,
        bodyScope,
        this,
        this.environment,
        this.moduleBuilder,
      );
      const body = (this.bodyNode as ESTree.Program | ESTree.BlockStatement).body;
      buildStatementList(
        body as ESTree.Statement[],
        bodyScope,
        this,
        this.moduleBuilder,
        this.environment,
      );
    }

    const functionIR = new FunctionIR(
      functionId,
      this.header,
      params,
      paramBindings,
      this.async,
      this.generator,
      this.blocks,
      this.structures,
      [...this.captureParams.values()],
      this.blockLabels,
    );
    this.moduleBuilder.functions.set(functionIR.id, functionIR);
    return functionIR;
  }

  public addInstruction<T extends BaseInstruction>(instruction: T) {
    this.currentBlock.appendInstruction(instruction);
    this.environment.placeToInstruction.set(instruction.place.id, instruction);
  }

  public registerDeclarationName(name: string, declarationId: DeclarationId, scope: Scope) {
    scope.setData(name, declarationId);
  }

  public getDeclarationId(name: string, scope: Scope): DeclarationId | undefined {
    return scope.getData(name) as DeclarationId | undefined;
  }

  public registerDeclarationSourceName(declarationId: DeclarationId, name: string) {
    const declaration = this.declarationBindings.get(declarationId);
    if (declaration !== undefined) {
      declaration.sourceName = name;
    }
  }

  public instantiateDeclaration(declarationId: DeclarationId, kind: DeclarationKind, name: string) {
    if (!this.declarationBindings.has(declarationId)) {
      this.declarationBindings.set(declarationId, {
        kind,
        state: getInitialDeclarationState(kind),
        sourceName: name,
      });
      return;
    }

    this.registerDeclarationSourceName(declarationId, name);
  }

  public markDeclarationInitialized(declarationId: DeclarationId) {
    const declaration = this.declarationBindings.get(declarationId);
    if (declaration !== undefined) {
      declaration.state = "initialized";
    }
  }

  public isDeclarationInTDZ(declarationId: DeclarationId): boolean {
    if (!this.isOwnDeclaration(declarationId)) {
      return false;
    }

    const declaration = this.declarationBindings.get(declarationId);
    if (
      declaration === undefined ||
      (declaration.kind !== "let" && declaration.kind !== "const" && declaration.kind !== "class")
    ) {
      return false;
    }

    return declaration.state === "uninitialized";
  }

  public getDeclarationSourceName(declarationId: DeclarationId): string | undefined {
    return this.declarationBindings.get(declarationId)?.sourceName;
  }

  public isOwnDeclaration(declarationId: DeclarationId): boolean {
    const entries = this.environment.declToPlaces.get(declarationId);
    if (!entries || entries.length === 0) return false;
    return this.blocks.has(entries[0].blockId);
  }

  public propagateCapturesFrom(child: FunctionIRBuilder): void {
    for (const [declId, capture] of child.captures) {
      if (!this.isOwnDeclaration(declId)) {
        this.captures.set(declId, capture);
        if (!this.captureParams.has(declId)) {
          const paramIdentifier = this.environment.createIdentifier(declId);
          paramIdentifier.name = capture.identifier.name;
          this.captureParams.set(declId, this.environment.createPlace(paramIdentifier));
        }
        child.captures.set(declId, this.captureParams.get(declId)!);
      }
    }
  }

  public getBreakTarget(label?: string): BlockId | undefined {
    if (label !== undefined) {
      for (let i = this.controlStack.length - 1; i >= 0; i--) {
        if (this.controlStack[i].label === label) {
          return this.controlStack[i].breakTarget;
        }
      }
      return undefined;
    }
    return this.controlStack[this.controlStack.length - 1]?.breakTarget;
  }

  public getContinueTarget(label?: string): BlockId | undefined {
    if (label !== undefined) {
      for (let i = this.controlStack.length - 1; i >= 0; i--) {
        const ctx = this.controlStack[i];
        if (ctx.label === label && ctx.kind === "loop") {
          return ctx.continueTarget;
        }
      }
      return undefined;
    }
    for (let i = this.controlStack.length - 1; i >= 0; i--) {
      const ctx = this.controlStack[i];
      if (ctx.kind === "loop") {
        return ctx.continueTarget;
      }
    }
    return undefined;
  }
}

function getInitialDeclarationState(kind: DeclarationKind): DeclarationState {
  switch (kind) {
    case "let":
    case "const":
    case "class":
    case "param":
      return "uninitialized";
    default:
      return "initialized";
  }
}
