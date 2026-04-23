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
  Value,
  Region,
  ReturnTermOp,
} from "../../ir";
import { FuncOp, type FuncOpId, makeFuncOpId } from "../../ir/core/FuncOp";
import { VERIFY_IR } from "../../ir/verify";
import type * as AST from "../estree";
import { isExpression, unwrapTSTypeWrappers } from "../estree";
import { type Scope, type ScopeMap } from "../scope/Scope";
import { instantiateScopeBindings } from "./bindings";
import { buildFunctionParams } from "./buildFunctionParams";
import { buildNode } from "./buildNode";
import { ModuleIRBuilder } from "./ModuleIRBuilder";
import { buildStatementList } from "./statements/buildStatementList";

export type DeclarationState = "uninitialized" | "initialized";

export class FuncOpBuilder {
  public currentBlock: BasicBlock;
  /**
   * Full list of entry-time setup ops, handed to `FuncOp.prologue`
   * at build time. Includes everything in {@link header} plus any
   * runtime-only ops (param-array gathering, lowered destructuring)
   * that passes see but codegen doesn't.
   */
  public readonly prologue: Operation[] = [];
  /**
   * Strict subset of {@link prologue}: ops that codegen walks during
   * signature emission (default values, computed destructure keys).
   * `addHeaderOp` pushes to both; runtime-only ops go into `prologue`
   * alone.
   */
  public readonly header: Operation[] = [];
  public readonly controlStack: ControlContext[] = [];
  public readonly blockLabels: Map<BlockId, string> = new Map();

  /**
   * The function's top-level body region. The source of truth for
   * block ownership — `addBlock` always appends to the region on top
   * of {@link regionStack}, which starts with this body region and
   * grows when structured-CF builders push a nested region.
   */
  public readonly bodyRegion: Region;

  /**
   * Region stack. Always non-empty: the bottom is the function's
   * body region, and structured-CF builders push inner regions on
   * top via {@link withStructureRegion} so blocks created while the
   * inner region is on top land inside it.
   */
  private readonly regionStack: Region[];

  /**
   * Transient set of every block id that belongs to this builder's
   * function, populated on every {@link addBlock}. Used only during
   * the building phase so queries like {@link isOwnDeclaration} can
   * check "is this block mine?" before the region hierarchy is fully
   * attached — when a nested structure region is still floating
   * (its owning BlockOp / IfOp / ... hasn't been instantiated yet)
   * its blocks are not yet reachable from `bodyRegion.allBlocks()`.
   *
   * This is NOT exposed on the built `FuncOp`: once building is done
   * and every region is attached to its owning op, the region tree
   * is the single source of truth.
   */
  private readonly ownedBlockIds: Set<BlockId> = new Set();

  /**
   * Places captured from enclosing scopes, keyed by DeclarationId to
   * avoid duplicates when the same variable is referenced multiple times.
   * Stored on the function instruction so that `getOperands()` exposes
   * them to optimization passes, preventing DCE from eliminating captured
   * variable definitions in the outer scope.
   */
  public readonly captures = new Map<DeclarationId, Value>();

  /**
   * Local places inside this function that correspond to each captured
   * variable. Aligned by key with `captures`: for each DeclarationId,
   * `captureParams.get(declId)` is the local Value that instructions in
   * this function's blocks use to reference the captured variable.
   *
   * This indirection decouples the function's blocks from the parent
   * scope's identifiers, so rewriting captures (e.g. during SSA or
   * inlining) never requires modifying the function's blocks.
   */
  public readonly captureParams = new Map<DeclarationId, Value>();
  public readonly declarationStates = new Map<DeclarationId, DeclarationState>();

  /**
   * Stable id of the FuncOp this builder is producing. Allocated at
   * construction time (before the body is built) so that declaration
   * metadata can reference the owning function while the body is still
   * being built.
   */
  public readonly funcOpId: FuncOpId;

  /**
   * Id of the FuncOp that lexically encloses this one, or `null` for
   * top-level (module) functions. Used by declaration metadata and by
   * the function inliner's visibility checks to walk up the function
   * nesting tree without consulting `LexicalScope`.
   */
  public readonly parentFuncOpId: FuncOpId | null;

  constructor(
    public readonly params: AST.Pattern[],
    public readonly bodyNode: Program | BlockStatement | Expression,
    public readonly scope: Scope,
    public readonly scopeMap: ScopeMap,
    public readonly environment: Environment,
    public readonly moduleBuilder: ModuleIRBuilder,
    public readonly async: boolean,
    public readonly generator: boolean,
    parentFuncOpId: FuncOpId | null = null,
  ) {
    this.funcOpId = makeFuncOpId(this.environment.nextOperationId++);
    this.parentFuncOpId = parentFuncOpId;
    this.bodyRegion = new Region([]);
    this.regionStack = [this.bodyRegion];
    const entryBlock = this.environment.createBlock();
    this.addBlock(entryBlock);
    this.currentBlock = entryBlock;
  }

  /**
   * Register a newly-created block with the builder by appending it
   * to the region on top of {@link regionStack}. The stack always
   * has the function's {@link bodyRegion} at the bottom, so blocks
   * created outside any structured-CF builder land in the body
   * region. Structured-CF builders push their own region via
   * {@link withStructureRegion} so blocks built while that region is
   * on top land inside it. The block id is also recorded in the
   * transient {@link ownedBlockIds} set so `isOwnDeclaration` can
   * tell "this block is mine" before the whole region hierarchy is
   * attached.
   */
  /** Look up a block by id among those owned by this builder. */
  public maybeBlock(id: BlockId): BasicBlock | undefined {
    for (const b of this.bodyRegion.allBlocks()) {
      if (b.id === id) return b;
    }
    return undefined;
  }

  public addBlock(block: BasicBlock): void {
    this.regionStack[this.regionStack.length - 1].appendBlock(block);
    this.ownedBlockIds.add(block.id);
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

  /** Resolve the scope for a given AST node. */
  public scopeFor(node: Node): Scope {
    return this.scopeMap.get(node) ?? this.scope;
  }

  /**
   * Build the function body into a FuncOp.
   *
   * @param preamble - Optional callback invoked after scope bindings are
   *   instantiated but before the body statements are built. Used by the
   *   class field desugaring to inject `this.<key> = <value>` instructions
   *   at the start of a constructor body.
   */
  public build(preamble?: (builder: FuncOpBuilder) => void): FuncOp {
    const builtParams = buildFunctionParams(
      this.params,
      this.scope,
      this,
      this.moduleBuilder,
      this.environment,
    );
    const params = builtParams.map((p) => p.place);
    const paramTargets = builtParams.map((p) => p.target);
    const requiresRuntimeParamDestructure = builtParams.some(
      (param) => param.target.kind !== "binding" || param.target.place !== param.place,
    );
    if (requiresRuntimeParamDestructure) {
      const runtimeParamArray = this.environment.createOperation(
        ArrayExpressionOp,
        this.environment.createValue(),
        params,
      );
      this.prologue.push(runtimeParamArray);

      const runtimeParamDestructure = this.environment.createOperation(
        ArrayDestructureOp,
        this.environment.createValue(),
        paramTargets,
        runtimeParamArray.place,
        "declaration",
        "const",
      );
      this.prologue.push(runtimeParamDestructure);
    }

    const functionId = this.funcOpId;

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
        this.currentBlock.setTerminal(new ReturnTermOp(createOperationId(this.environment), resultPlace));
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

    // Textbook MLIR: function parameters are the entry block's block
    // parameters. Each formal param's SSA root Value binds to the
    // entry block's params[i] slot, and the caller supplies argument
    // values when it invokes the function. Same Value instances that
    // used to live in `FunctionRuntime.params`.
    this.bodyRegion.entry.params = params;

    // The constructor self-registers in moduleIR.functions, so no explicit
    // registration step is needed here.
    const bodyScopeKind = this.scope.kind === "program" ? "program" : "function";
    const funcOp = new FuncOp(
      this.moduleBuilder.moduleIR,
      functionId,
      this.prologue,
      this.header,
      paramTargets,
      [...this.captureParams.values()],
      this.async,
      this.generator,
      this.bodyRegion,
      this.blockLabels,
      this.parentFuncOpId,
      bodyScopeKind,
    );
    return funcOp;
  }

  public addOp<T extends Operation>(instruction: T) {
    this.currentBlock.appendOp(instruction);
    if (VERIFY_IR) instruction.verify();
  }

  public addHeaderOp(instruction: Operation) {
    this.prologue.push(instruction);
    this.header.push(instruction);
  }

  public addHeaderOps(ops: Operation[]) {
    this.prologue.push(...ops);
    this.header.push(...ops);
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
    _scope?: Scope,
  ) {
    this.environment.registerDeclarationMetadata(declarationId, {
      kind,
      sourceName: name,
      funcOpId: this.funcOpId,
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
    const entries = this.environment.declToValues.get(declarationId);
    if (!entries || entries.length === 0) return false;
    return this.ownedBlockIds.has(entries[0].blockId);
  }

  public propagateCapturesFrom(child: FuncOpBuilder): void {
    for (const [declId, capture] of child.captures) {
      if (!this.isOwnDeclaration(declId)) {
        this.captures.set(declId, capture);
        if (!this.captureParams.has(declId)) {
          const paramIdentifier = this.environment.createValue(declId);
          this.captureParams.set(declId, paramIdentifier);
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
   * between emitting a `BreakTermOp` (structured) and a raw `JumpTermOp(target)`
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
