import type { BlockStatement, Expression, Node, Program, Statement } from "oxc-parser";
import { Environment } from "../../environment";
import {
  ArrayDestructureOp,
  ArrayExpressionOp,
  Operation,
  BasicBlock,
  BlockId,
  type ControlContext,
  createOperationId,
  DeclarationId,
  type DeclarationKind,
  Place,
  Region,
  ReturnOp,
  type Structure,
} from "../../ir";
import { FunctionIR, makeFunctionIRId } from "../../ir/core/FunctionIR";
import type { LexicalScopeId, LexicalScopeKind } from "../../ir/core/LexicalScope";
import type * as AST from "../estree";
import { isExpression, unwrapTSTypeWrappers } from "../estree";
import { type Scope, type ScopeMap } from "../scope/Scope";
import { instantiateScopeBindings } from "./bindings";
import { buildFunctionParams } from "./buildFunctionParams";
import { buildNode } from "./buildNode";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildStatementList } from "./statements/buildStatementList";

export type DeclarationState = "uninitialized" | "initialized";

export class FunctionIRBuilder {
  public currentBlock: BasicBlock;
  public readonly blocks: Map<BlockId, BasicBlock> = new Map();
  public readonly structures: Map<BlockId, Structure> = new Map();
  public readonly sourceHeader: Operation[] = [];
  public readonly runtimePrologue: Operation[] = [];
  public readonly controlStack: ControlContext[] = [];
  public readonly blockLabels: Map<BlockId, string> = new Map();

  /**
   * Stack of in-progress structure regions. When non-empty, new blocks
   * created via {@link addBlock} are claimed by the top region; when
   * empty, new blocks are unclaimed and end up in the function's
   * top-level `body` region at `FunctionIR` construction time.
   *
   * Used by structured-CF builders (for-of, for-in, block, labeled
   * block) to populate their nested MLIR regions with body blocks as
   * the body is being built.
   */
  private regionStack: Region[] = [];

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
  public readonly declarationStates = new Map<DeclarationId, DeclarationState>();

  constructor(
    public readonly params: AST.Pattern[],
    public readonly bodyNode: Program | BlockStatement | Expression,
    public readonly scope: Scope,
    public readonly scopeMap: ScopeMap,
    public readonly environment: Environment,
    public readonly moduleBuilder: ModuleIRBuilder,
    public readonly async: boolean,
    public readonly generator: boolean,
  ) {
    const entryScopeId = this.ensureIRScope(scope);
    const entryBlock = this.environment.createBlock(entryScopeId);
    this.blocks.set(entryBlock.id, entryBlock);
    this.currentBlock = entryBlock;
  }

  /**
   * Register a newly-created block with the builder. Adds it to the
   * flat {@link blocks} id index and — if a structure region is
   * currently on the region stack — claims the block into that
   * region. Unclaimed blocks are placed into the function's top-level
   * body region at `FunctionIR` construction.
   *
   * Replaces direct `functionBuilder.blocks.set(block.id, block)`
   * calls so block creation is uniformly region-aware.
   */
  public addBlock(block: BasicBlock): void {
    this.blocks.set(block.id, block);
    if (this.regionStack.length > 0) {
      this.regionStack[this.regionStack.length - 1].appendBlock(block);
    }
  }

  /**
   * Run `fn` with `region` pushed onto the region stack. Any block
   * created via {@link addBlock} inside `fn` (and not claimed by a
   * more deeply nested structure region) is appended to `region`.
   */
  public withStructureRegion<T>(region: Region, fn: () => T): T {
    this.regionStack.push(region);
    try {
      return fn();
    } finally {
      this.regionStack.pop();
    }
  }

  /**
   * Ensure a frontend Scope has a corresponding IR scope. Creates one
   * if it doesn't exist yet. The `kind` parameter overrides the frontend
   * scope's coarse kind with a specific IR ScopeKind (e.g. "switch",
   * "for", "catch") so the IR keeps the lexical construct kind even
   * when the frontend scope uses the coarse "block" classification.
   */
  public ensureIRScope(frontendScope: Scope, kind?: LexicalScopeKind): LexicalScopeId {
    const existing = this.moduleBuilder.scopeToLexicalScope.get(frontendScope);
    if (existing !== undefined) return existing;
    const parentId = frontendScope.parent ? this.ensureIRScope(frontendScope.parent) : null;
    const irScope = this.environment.createScope(parentId, kind ?? frontendScope.kind);
    this.moduleBuilder.scopeToLexicalScope.set(frontendScope, irScope.id);
    return irScope.id;
  }

  /** Resolve a frontend scope to its lexical scope id, creating it if needed. */
  public lexicalScopeIdFor(frontendScope: Scope, kind?: LexicalScopeKind): LexicalScopeId {
    return this.ensureIRScope(frontendScope, kind);
  }

  /** Resolve the scope for a given AST node. */
  public scopeFor(node: Node): Scope {
    return this.scopeMap.get(node) ?? this.scope;
  }

  /**
   * Build the function body into a FunctionIR.
   *
   * @param preamble - Optional callback invoked after scope bindings are
   *   instantiated but before the body statements are built. Used by the
   *   class field desugaring to inject `this.<key> = <value>` instructions
   *   at the start of a constructor body.
   */
  public build(preamble?: (builder: FunctionIRBuilder) => void): FunctionIR {
    const builtParams = buildFunctionParams(
      this.params,
      this.scope,
      this,
      this.moduleBuilder,
      this.environment,
    );
    const params = builtParams.map((p) => p.place);
    const paramTargets = builtParams.map((p) => p.target);
    const paramBindings = builtParams.map((p) => p.paramBindings);
    const requiresRuntimeParamDestructure = builtParams.some(
      (param) => param.target.kind !== "binding" || param.target.place !== param.place,
    );
    if (requiresRuntimeParamDestructure) {
      const runtimeParamArray = this.environment.createOperation(
        ArrayExpressionOp,
        this.environment.createPlace(this.environment.createIdentifier()),
        params,
      );
      this.runtimePrologue.push(runtimeParamArray);
      this.environment.placeToOp.set(runtimeParamArray.place.id, runtimeParamArray);

      const runtimeParamDestructure = this.environment.createOperation(
        ArrayDestructureOp,
        this.environment.createPlace(this.environment.createIdentifier()),
        paramTargets,
        runtimeParamArray.place,
        "declaration",
        "const",
        true,
      );
      this.runtimePrologue.push(runtimeParamDestructure);
      this.environment.placeToOp.set(runtimeParamDestructure.place.id, runtimeParamDestructure);
    }

    const functionId = makeFunctionIRId(this.environment.nextFunctionId++);

    const effectiveBody = unwrapTSTypeWrappers(this.bodyNode) as
      | Program
      | BlockStatement
      | Expression;

    if (isExpression(effectiveBody)) {
      const resultPlace = buildNode(
        effectiveBody,
        this.scope,
        this,
        this.moduleBuilder,
        this.environment,
      );
      if (resultPlace !== undefined && !Array.isArray(resultPlace)) {
        this.currentBlock.terminal = new ReturnOp(createOperationId(this.environment), resultPlace);
      }
    } else {
      const bodyScope = this.scopeFor(effectiveBody);
      instantiateScopeBindings(
        effectiveBody,
        bodyScope,
        this,
        this.environment,
        this.moduleBuilder,
      );
      if (preamble) {
        preamble(this);
      }
      const body = effectiveBody.body;
      buildStatementList(
        body as Statement[],
        bodyScope,
        this,
        this.moduleBuilder,
        this.environment,
      );
    }

    // The constructor self-registers in moduleIR.functions, so no explicit
    // registration step is needed here.
    const source = { header: this.sourceHeader, params: paramTargets };
    const runtime = {
      params,
      paramTargets,
      paramBindings,
      prologue: this.runtimePrologue,
      captureParams: [...this.captureParams.values()],
    };
    const functionIR = new FunctionIR(
      this.moduleBuilder.moduleIR,
      functionId,
      source,
      runtime,
      this.async,
      this.generator,
      this.blocks,
      this.structures,
      this.blockLabels,
    );
    return functionIR;
  }

  public addOp<T extends Operation>(instruction: T) {
    this.currentBlock.appendOp(instruction);
    this.environment.placeToOp.set(instruction.place!.id, instruction);
  }

  public addHeaderOp(instruction: Operation) {
    this.sourceHeader.push(instruction);
    this.runtimePrologue.push(instruction);
  }

  public addHeaderOps(ops: Operation[]) {
    this.sourceHeader.push(...ops);
    this.runtimePrologue.push(...ops);
  }

  public registerDeclarationName(name: string, declarationId: DeclarationId, scope: Scope) {
    scope.setData(name, declarationId);
  }

  public getDeclarationId(name: string, scope: Scope): DeclarationId | undefined {
    return scope.getData(name) as DeclarationId | undefined;
  }

  public registerDeclarationSourceName(declarationId: DeclarationId, name: string) {
    const metadata = this.environment.getDeclarationMetadata(declarationId);
    if (metadata !== undefined) {
      metadata.sourceName = name;
    }
  }

  public instantiateDeclaration(
    declarationId: DeclarationId,
    kind: DeclarationKind,
    name: string,
    scope?: Scope,
  ) {
    this.environment.registerDeclarationMetadata(declarationId, {
      kind,
      sourceName: name,
      scopeId: scope ? this.ensureIRScope(scope) : undefined,
    });
    if (!this.declarationStates.has(declarationId)) {
      this.declarationStates.set(declarationId, getInitialDeclarationState(kind));
      return;
    }
    this.registerDeclarationSourceName(declarationId, name);
  }

  public markDeclarationInitialized(declarationId: DeclarationId) {
    if (this.declarationStates.has(declarationId)) {
      this.declarationStates.set(declarationId, "initialized");
    }
  }

  public isDeclarationInTDZ(declarationId: DeclarationId): boolean {
    if (!this.isOwnDeclaration(declarationId)) {
      return false;
    }

    const declaration = this.environment.getDeclarationMetadata(declarationId);
    if (
      declaration === undefined ||
      (declaration.kind !== "let" && declaration.kind !== "const" && declaration.kind !== "class")
    ) {
      return false;
    }

    return this.declarationStates.get(declarationId) === "uninitialized";
  }

  public getDeclarationSourceName(declarationId: DeclarationId): string | undefined {
    return this.environment.getDeclarationMetadata(declarationId)?.sourceName;
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
          this.captureParams.set(declId, this.environment.createPlace(paramIdentifier));
        }
        child.captures.set(declId, this.captureParams.get(declId)!);
      }
    }
  }

  public getBreakTarget(label?: string): BlockId | undefined {
    return this.getBreakControl(label)?.breakTarget;
  }

  /**
   * Returns the control-stack entry that an unlabeled-or-labeled `break`
   * targets, including its `structured` flag so callers can decide
   * between emitting a `BreakOp` (structured) and a raw `JumpOp(target)`
   * (flat). Returns `undefined` when no matching enclosing construct
   * exists.
   */
  public getBreakControl(label?: string): ControlContext | undefined {
    if (label !== undefined) {
      for (let i = this.controlStack.length - 1; i >= 0; i--) {
        if (this.controlStack[i].label === label) {
          return this.controlStack[i];
        }
      }
      return undefined;
    }
    return this.controlStack[this.controlStack.length - 1];
  }

  public getContinueTarget(label?: string): BlockId | undefined {
    return this.getContinueControl(label)?.continueTarget;
  }

  /** Like {@link getBreakControl} but for `continue`. */
  public getContinueControl(label?: string): (ControlContext & { kind: "loop" }) | undefined {
    if (label !== undefined) {
      for (let i = this.controlStack.length - 1; i >= 0; i--) {
        const ctx = this.controlStack[i];
        if (ctx.label === label && ctx.kind === "loop") {
          return ctx;
        }
      }
      return undefined;
    }
    for (let i = this.controlStack.length - 1; i >= 0; i--) {
      const ctx = this.controlStack[i];
      if (ctx.kind === "loop") {
        return ctx;
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
