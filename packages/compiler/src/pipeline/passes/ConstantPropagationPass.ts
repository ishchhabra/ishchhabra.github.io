import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  BinaryExpressionOp,
  CallExpressionOp,
  LiteralOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  Operation,
  StoreLocalOp,
  TPrimitiveValue,
  UnaryExpressionOp,
  Value,
} from "../../ir";
import { getExportBindingPlace } from "../../ir/core/ModuleIR";
import {
  BUILTIN_GLOBAL_CONSTANTS,
  BUILTIN_STATIC_CONSTANTS,
  canFoldBuiltin,
  lookupBuiltin,
  UNRESOLVED,
} from "../../ir/builtins";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { JumpTermOp } from "../../ir/ops/control";
import { TemplateLiteralOp } from "../../ir/ops/prim/TemplateLiteral";
import { getQualifiedName, type ResolveConstantContext } from "./resolveConstant";

// ---------------------------------------------------------------------------
// Lattice
// ---------------------------------------------------------------------------

const TOP: unique symbol = Symbol("top");
const BOTTOM: unique symbol = Symbol("bottom");

type Lattice =
  | typeof TOP
  | typeof BOTTOM
  | { readonly kind: "const"; readonly value: TPrimitiveValue };

function isConst(l: Lattice): l is { kind: "const"; value: TPrimitiveValue } {
  return l !== TOP && l !== BOTTOM;
}

/**
 * Lattice meet. TOP is the identity; BOTTOM is absorbing; two distinct
 * constants meet to BOTTOM; equal constants meet to themselves.
 */
function meet(a: Lattice, b: Lattice): Lattice {
  if (a === TOP) return b;
  if (b === TOP) return a;
  if (a === BOTTOM || b === BOTTOM) return BOTTOM;
  return Object.is(a.value, b.value) ? a : BOTTOM;
}

// ---------------------------------------------------------------------------
// Pass
// ---------------------------------------------------------------------------

/**
 * Sparse constant propagation — the value-lattice half of SCCP
 * (Wegman-Zadeck 1991), without the conditional-branch-folding half.
 * Matches the factoring used in MLIR, Cranelift, and V8 Turbofan for
 * region-based IRs: a single pass computes a constant lattice over
 * all values; structural rewrites (collapsing a constant-test `IfOp`
 * into its taken region, deleting a dead `WhileOp`, etc.) belong to
 * a separate canonicalization pass that runs after this one has
 * replaced the constant-valued test with a literal.
 *
 * Algorithm:
 *
 *   - Lattice cell per {@link Value}: TOP (not-yet-computed), BOTTOM
 *     (not a compile-time constant), or a specific primitive.
 *   - SSA worklist: when a value's cell changes, enqueue. Dequeue,
 *     re-evaluate every op that reads the value via the embedded
 *     {@link Value.users} chain — sparse, never a full block sweep.
 *   - Block params are evaluated like phi nodes: meet of the
 *     corresponding `JumpTermOp.args[i]` across each predecessor edge.
 *
 * Folding decisions:
 *
 *   - Pure arithmetic / logical / unary / template-literal / load
 *     ops with constant operands evaluate to the computed primitive.
 *   - `LoadGlobalOp` / `LoadStaticPropertyOp` consult the builtin
 *     table ({@link BUILTIN_GLOBAL_CONSTANTS}, {@link BUILTIN_STATIC_CONSTANTS}).
 *   - `CallExpressionOp` consults {@link lookupBuiltin}: if the callee
 *     resolves to a pure, deterministic, foldable builtin and all
 *     args are constants, the call folds.
 *   - User-supplied `options.resolveConstant` hook runs first, before
 *     any builtin resolution.
 *
 * Cross-module: the pass walks a single function; at the end, if the
 * function is the module's entry, each exported binding's lattice
 * value is published to {@link ModuleIR.summary} so downstream
 * modules consume it via `LoadGlobal` of the matching imported name.
 *
 * **Not in this pass (intentional, handled elsewhere):**
 *
 *   - Conditional-executability tracking and dead-edge precision
 *     (the "C" in SCCP). Without a structural branch folder, the
 *     extra lattice precision can't be exploited — both LLVM's SCCP
 *     and MLIR's sparse CP skip it in region-heavy IRs. When a
 *     canonicalizer pass for `IfOp` / `WhileOp` / `ConditionTermOp`
 *     exists, we can revisit adding it.
 *   - Partial template-literal folding (e.g. `` `a${k}b${x}` `` →
 *     `` `aCONSTb${x}` ``). {@link AlgebraicSimplificationPass}'s job.
 */
export class ConstantPropagationPass {
  private readonly lattice = new Map<Value, Lattice>();
  /** Values resolved by the `options.resolveConstant` hook, for replace-policy. */
  private readonly hookResolved = new Set<Value>();
  /** Values resolved from a builtin call evaluator, for replace-policy. */
  private readonly builtinResolved = new Set<Value>();
  private readonly ssaWorklist: Value[] = [];
  private readonly resolveCtx: ResolveConstantContext;

  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
    private readonly projectUnit: ProjectUnit,
    private readonly options: CompilerOptions,
  ) {
    this.resolveCtx = {
      set: () => {
        throw new Error("resolveConstant.set() called outside hook invocation");
      },
      get: (place) => {
        const l = this.getLattice(place);
        return isConst(l) ? l.value : undefined;
      },
      has: (place) => isConst(this.getLattice(place)),
      environment: this.moduleIR.environment,
    };
  }

  public run(): { changed: boolean } {
    this.seed();
    this.drain();
    const changed = this.apply();
    this.publishSummary();
    return { changed };
  }

  // -------------------------------------------------------------------------
  // Seeding
  // -------------------------------------------------------------------------

  /**
   * Function entry: parameters and captures are externally supplied
   * (BOTTOM). Every literal op immediately has a known constant.
   * Block params start as TOP and converge via predecessor meets.
   */
  private seed(): void {
    for (const param of this.funcOp.params) {
      this.setLattice(param.value, BOTTOM);
    }
    // Non-SSA block params on merge sinks start TOP and converge.
    for (const block of this.funcOp.blocks) {
      for (const op of block.getAllOps()) {
        this.evaluate(op);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Worklist
  // -------------------------------------------------------------------------

  private drain(): void {
    while (this.ssaWorklist.length > 0) {
      const value = this.ssaWorklist.pop()!;
      for (const user of value.users) {
        const op = user as Operation;
        if (op instanceof JumpTermOp) {
          // Block-arg flow: a changed arg may update a target block param.
          this.evaluateBlockParams(op.target);
          continue;
        }
        this.evaluate(op);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lattice access
  // -------------------------------------------------------------------------

  private getLattice(value: Value): Lattice {
    return this.lattice.get(value) ?? TOP;
  }

  /**
   * Meet the new value into the lattice cell. If the cell moves down
   * the lattice, enqueue the Value for re-propagation to its users.
   */
  private setLattice(value: Value, next: Lattice): void {
    const prev = this.lattice.get(value) ?? TOP;
    const after = meet(prev, next);
    if (prev === after || (isConst(prev) && isConst(after) && Object.is(prev.value, after.value))) {
      return;
    }
    this.lattice.set(value, after);
    this.ssaWorklist.push(value);
  }

  private makeConst(value: TPrimitiveValue): Lattice {
    return { kind: "const", value };
  }

  // -------------------------------------------------------------------------
  // Block params (phi-like evaluation)
  // -------------------------------------------------------------------------

  /**
   * Merge-sink evaluation. For each param index `i`, meet the value
   * arriving on that index from every flat-CFG predecessor (each
   * predecessor's terminator is a {@link JumpTermOp} whose `args[i]`
   * flows into `block.params[i]`).
   */
  private evaluateBlockParams(block: BasicBlock): void {
    if (block.params.length === 0) return;
    for (let i = 0; i < block.params.length; i++) {
      let m: Lattice = TOP;
      for (const pred of block.predecessors()) {
        const terminal = pred.terminal;
        if (!(terminal instanceof JumpTermOp) || terminal.target !== block) continue;
        const arg = terminal.args[i];
        if (arg === undefined) continue;
        m = meet(m, this.getLattice(arg));
        if (m === BOTTOM) break;
      }
      this.setLattice(block.params[i], m);
    }
  }

  // -------------------------------------------------------------------------
  // Op evaluators — dispatch + per-op lattice computation
  // -------------------------------------------------------------------------

  private evaluate(op: Operation): void {
    if (op instanceof JumpTermOp) {
      this.evaluateBlockParams(op.target);
      return;
    }
    if (op.place === undefined) return;

    // User hook + builtin fallback. If either resolves, we're done.
    const resolved = this.tryResolveConstant(op);
    if (resolved !== UNRESOLVED) {
      this.setLattice(op.place, this.makeConst(resolved));
      return;
    }

    if (op instanceof LiteralOp) {
      this.setLattice(op.place, this.makeConst(op.value));
      return;
    }
    if (op instanceof BinaryExpressionOp) return this.evaluateBinary(op);
    if (op instanceof UnaryExpressionOp) return this.evaluateUnary(op);
    if (op instanceof TemplateLiteralOp) return this.evaluateTemplate(op);
    if (op instanceof LoadLocalOp) return this.evaluateLoadLocal(op);
    if (op instanceof StoreLocalOp) {
      // The store's own `place` and `lval` both carry the stored value.
      this.forward(op.place, op.value);
      this.forward(op.lval, op.value);
      return;
    }
    if (op instanceof LoadGlobalOp) return this.evaluateLoadGlobal(op);
    if (op instanceof LoadStaticPropertyOp) return this.evaluateLoadStatic(op);
    if (op instanceof CallExpressionOp) return this.evaluateCall(op);

    // Unknown op that produces a value — can't prove constant.
    if (op.operands().length > 0 || op.place !== undefined) {
      this.setLattice(op.place, BOTTOM);
    }
  }

  private forward(dst: Value, src: Value): void {
    this.setLattice(dst, this.getLattice(src));
  }

  private evaluateBinary(op: BinaryExpressionOp): void {
    const l = this.getLattice(op.left);
    const r = this.getLattice(op.right);
    if (l === TOP || r === TOP) return;
    if (l === BOTTOM || r === BOTTOM) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const [a, b] = [l.value, r.value];
    let v: TPrimitiveValue;
    switch (op.operator) {
      case "==":
        v = a == b;
        break;
      case "!=":
        v = a != b;
        break;
      case "===":
        v = a === b;
        break;
      case "!==":
        v = a !== b;
        break;
      case "+":
        v = (a as number) + (b as number);
        break;
      case "-":
        v = (a as number) - (b as number);
        break;
      case "*":
        v = (a as number) * (b as number);
        break;
      case "/":
        v = (a as number) / (b as number);
        break;
      case "%":
        v = (a as number) % (b as number);
        break;
      case "**":
        v = (a as number) ** (b as number);
        break;
      case "|":
        v = (a as number) | (b as number);
        break;
      case "&":
        v = (a as number) & (b as number);
        break;
      case "^":
        v = (a as number) ^ (b as number);
        break;
      case ">>":
        v = (a as number) >> (b as number);
        break;
      case ">>>":
        v = (a as number) >>> (b as number);
        break;
      case "<<":
        v = (a as number) << (b as number);
        break;
      case ">":
        v = (a as number) > (b as number);
        break;
      case ">=":
        v = (a as number) >= (b as number);
        break;
      case "<":
        v = (a as number) < (b as number);
        break;
      case "<=":
        v = (a as number) <= (b as number);
        break;
      default:
        this.setLattice(op.place, BOTTOM);
        return;
    }
    this.setLattice(op.place, this.makeConst(v));
  }

  private evaluateUnary(op: UnaryExpressionOp): void {
    if (op.operator === "void") {
      this.setLattice(op.place, this.makeConst(undefined));
      return;
    }
    const l = this.getLattice(op.argument);
    if (l === TOP) return;
    if (l === BOTTOM) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const x = l.value;
    let v: TPrimitiveValue;
    switch (op.operator) {
      case "!":
        v = !x;
        break;
      case "-":
        v = -(x as number);
        break;
      case "~":
        v = ~(x as number);
        break;
      case "+":
        v = +(x as number);
        break;
      case "typeof":
        v = typeof x;
        break;
      default:
        this.setLattice(op.place, BOTTOM);
        return;
    }
    this.setLattice(op.place, this.makeConst(v));
  }

  private evaluateTemplate(op: TemplateLiteralOp): void {
    if (op.expressions.length === 0) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const values: TPrimitiveValue[] = [];
    for (const expr of op.expressions) {
      const l = this.getLattice(expr);
      if (l === TOP) return;
      if (l === BOTTOM) {
        this.setLattice(op.place, BOTTOM);
        return;
      }
      values.push(l.value);
    }
    let s = "";
    for (let i = 0; i < op.quasis.length; i++) {
      s += op.quasis[i].value.cooked ?? op.quasis[i].value.raw;
      if (i < values.length) s += String(values[i]);
    }
    this.setLattice(op.place, this.makeConst(s));
  }

  /**
   * A `LoadLocalOp` reads the binding cell. Post-SSA its `.value`
   * operand is the unique Value corresponding to the reaching
   * store's lval (for non-promotable bindings, this is a fresh
   * SSA name allocated at rename time) or a phi block-param at a
   * merge point. Either way, `op.value.lattice` is correct by
   * construction — forward it.
   */
  private evaluateLoadLocal(op: LoadLocalOp): void {
    this.forward(op.place, op.value);
  }

  private evaluateLoadGlobal(op: LoadGlobalOp): void {
    const global = this.moduleIR.globals.get(op.name);
    if (global?.kind === "import") {
      // Cross-module: consult the source module's summary.
      const target = this.projectUnit.modules.get(global.source);
      const exp = target?.summary.exports.get(global.name);
      if (exp?.isEffectivelyConst) {
        this.setLattice(op.place, this.makeConst(exp.constValue!));
        return;
      }
      this.setLattice(op.place, BOTTOM);
      return;
    }
    // Not an import — may be a builtin global (undefined / NaN / Infinity).
    if (BUILTIN_GLOBAL_CONSTANTS.has(op.name)) {
      this.setLattice(op.place, this.makeConst(BUILTIN_GLOBAL_CONSTANTS.get(op.name)));
      return;
    }
    this.setLattice(op.place, BOTTOM);
  }

  private evaluateLoadStatic(op: LoadStaticPropertyOp): void {
    const qualified = getQualifiedName(op, this.moduleIR.environment);
    if (qualified !== undefined && BUILTIN_STATIC_CONSTANTS.has(qualified)) {
      this.setLattice(op.place, this.makeConst(BUILTIN_STATIC_CONSTANTS.get(qualified)));
      return;
    }
    this.setLattice(op.place, BOTTOM);
  }

  private evaluateCall(op: CallExpressionOp): void {
    const calleeOp = op.callee.def as Operation | undefined;
    if (calleeOp === undefined) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const qualified = getQualifiedName(calleeOp, this.moduleIR.environment);
    if (qualified === undefined) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    // Don't fold imported calls — we don't have the callee body.
    const rootName = qualified.split(".", 1)[0];
    if (this.moduleIR.globals.get(rootName)?.kind === "import") {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const spec = lookupBuiltin(qualified);
    if (!canFoldBuiltin(spec, op.args.length)) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    const argValues: TPrimitiveValue[] = [];
    for (const arg of op.args) {
      const l = this.getLattice(arg);
      if (l === TOP) return; // wait for operand to resolve
      if (l === BOTTOM) {
        this.setLattice(op.place, BOTTOM);
        return;
      }
      argValues.push(l.value);
    }
    let result: TPrimitiveValue | typeof UNRESOLVED;
    try {
      result = spec!.evaluate!(...argValues);
    } catch {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    if (result === UNRESOLVED) {
      this.setLattice(op.place, BOTTOM);
      return;
    }
    this.builtinResolved.add(op.place);
    this.setLattice(op.place, this.makeConst(result));
  }

  // -------------------------------------------------------------------------
  // User hook bridge
  // -------------------------------------------------------------------------

  private tryResolveConstant(op: Operation): TPrimitiveValue | typeof UNRESOLVED {
    if (op.place === undefined) return UNRESOLVED;
    let resolved = false;
    let value: TPrimitiveValue;
    this.resolveCtx.set = (v) => {
      resolved = true;
      value = v;
    };
    try {
      this.options.resolveConstant?.(op, this.resolveCtx);
    } finally {
      this.resolveCtx.set = () => {
        throw new Error("resolveConstant.set() called outside hook invocation");
      };
    }
    if (resolved) {
      this.hookResolved.add(op.place);
      return value!;
    }
    return UNRESOLVED;
  }

  // -------------------------------------------------------------------------
  // Apply
  // -------------------------------------------------------------------------

  /**
   * Rewrite every op whose result value has a constant lattice cell
   * into a {@link LiteralOp} — except when the op has side effects we
   * must preserve. A `void fetch(url)` evaluates to `undefined` but
   * we cannot delete the `fetch(url)` call; the literal replacement
   * policy excludes side-effectful unaries.
   */
  private apply(): boolean {
    let changed = false;
    for (const block of this.funcOp.blocks) {
      for (const op of [...block.operations]) {
        if (op instanceof LiteralOp) continue;
        if (op.place === undefined) continue;
        const l = this.getLattice(op.place);
        if (!isConst(l)) continue;
        if (!this.isReplaceable(op)) continue;
        block.replaceOp(op, new LiteralOp(op.id, op.place, l.value));
        changed = true;
      }
    }
    return changed;
  }

  private isReplaceable(op: Operation): boolean {
    if (
      op.place !== undefined &&
      (this.hookResolved.has(op.place) || this.builtinResolved.has(op.place))
    ) {
      return true;
    }
    if (op instanceof BinaryExpressionOp) return true;
    if (op instanceof UnaryExpressionOp) {
      return !op.hasSideEffects(this.moduleIR.environment);
    }
    if (op instanceof TemplateLiteralOp) return true;
    if (op instanceof LoadLocalOp) return true;
    if (op instanceof LoadGlobalOp) return true;
    if (op instanceof LoadStaticPropertyOp) return true;
    return false;
  }

  // -------------------------------------------------------------------------
  // Summary publish
  // -------------------------------------------------------------------------

  /**
   * Publish per-export facts into the module summary. Downstream
   * modules importing from this one consume the summary (not the
   * full IR) — mirroring LLVM ThinLTO. Today only `isEffectivelyConst`
   * + `constValue` are computed; purity, return-lattice, call-graph
   * summaries plug in here later.
   *
   * Only runs on the entry function — nested functions don't
   * contribute exports.
   */
  private publishSummary(): void {
    if (this.funcOp !== this.moduleIR.entryFuncOp) return;
    for (const [exportedName, exp] of this.moduleIR.exports) {
      const place = getExportBindingPlace(exp, this.moduleIR.environment);
      if (place === undefined) continue;
      const l = this.getLattice(place);
      if (!isConst(l)) continue;
      this.moduleIR.summary.exports.set(exportedName, {
        isEffectivelyConst: true,
        constValue: l.value,
      });
    }
  }
}
