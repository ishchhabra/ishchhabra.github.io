import {
  BinaryExpressionOp,
  LiteralOp,
  type BinaryOperator,
  type TPrimitiveValue,
  type Value,
} from "../../ir";
import type { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";

/**
 * Reassociation — canonicalize commutative, associative binary chains.
 *
 * The textbook pass (LLVM: `Reassociate`; GCC: `tree-ssa-reassoc`;
 * Morgan 1998, ch. on commutative/associative ops). Shape:
 *
 *   1. Flatten each associative chain into a list of operands.
 *   2. Sort the list by a stable rank. Constants rank 0 (leftmost);
 *      other values rank by their stable {@link Value.id}, which is
 *      monotonic in creation order and therefore a cheap proxy for
 *      "earlier-defined → smaller rank."
 *   3. Merge adjacent constants into a single literal.
 *   4. Rebuild as a left-leaning binary tree.
 *
 * Result: `(a * 2) * 3` → `a * 6`. And two syntactically different
 * trees that compute the same value (`(a * b) * c`, `a * (b * c)`,
 * `(b * a) * c`) collapse to one canonical form, which is what
 * downstream CSE / GVN will eventually want.
 *
 * **JS-specific scope.** In JS, `+` is polymorphic between numeric
 * addition and string concatenation — `1 + 2 + "3"` is `"33"` but
 * `1 + (2 + "3")` is `"123"`. Reassociating `+` without a proven
 * numeric type for both sides is unsound. Production JS compilers
 * (V8, Closure, SpiderMonkey) only reassociate `+` with type feedback
 * or when both sides are literal numbers. This pass does **not**
 * reassociate `+`; it sticks to the operators that coerce to int32
 * or Number unconditionally:
 *
 *   - `*` — always numeric.
 *   - `&`, `|`, `^` — always int32.
 *
 * Also excluded: `-`, `/`, `%`, `**`, comparison ops (not
 * associative); `<<`, `>>`, `>>>` (not associative); `&&`, `||`,
 * `??` (short-circuit; reassociating changes side-effect order).
 *
 * **Flatten only single-use intermediates.** A shared intermediate
 * (`let t = a*b; use(t*c); use(t)`) cannot be inlined — we'd
 * duplicate the computation. Only intermediates whose result has
 * exactly one use get absorbed into the chain. This is LLVM's rule.
 */
export class ReassociationPass {
  constructor(private readonly funcOp: FuncOp) {}

  public run(): { changed: boolean } {
    let changed = false;
    for (const block of this.funcOp.blocks) {
      for (const op of [...block.operations]) {
        if (!(op instanceof BinaryExpressionOp)) continue;
        if (!isReassociatable(op.operator)) continue;

        const operands = this.flatten(op);
        if (operands.length < 2) continue;

        const sorted = operands.slice().sort((a, b) => rank(a) - rank(b));
        const merged = this.mergeLiterals(sorted, op.operator, block, op);
        const rebuilt = this.rebuild(merged, op);

        if (rebuilt !== op) {
          block.replaceOp(op, rebuilt);
          changed = true;
        }
      }
    }
    return { changed };
  }

  /**
   * Walk an associative chain top-down, collecting leaf operands.
   * A node is "inlineable into the chain" iff its op is the same
   * operator AND its result has exactly one use (our chain). Any
   * shared intermediate stays as a single operand.
   */
  private flatten(root: BinaryExpressionOp): Value[] {
    const out: Value[] = [];
    const visit = (v: Value): void => {
      const def = v.def;
      if (
        def instanceof BinaryExpressionOp &&
        def.operator === root.operator &&
        v.users.size === 1
      ) {
        visit(def.left);
        visit(def.right);
        return;
      }
      out.push(v);
    };
    visit(root.left);
    visit(root.right);
    return out;
  }

  /**
   * Collapse every literal operand into a single accumulated
   * literal. After sort, literals sit at the tail, so we scan
   * backwards until we hit a non-literal.
   *
   * If there are fewer than 2 literals, the list is returned
   * unchanged. If every operand is a literal the caller gets a
   * single-element list back — {@link rebuild} handles that case by
   * replacing the root op with the literal.
   */
  private mergeLiterals(
    operands: Value[],
    operator: BinaryOperator,
    block: BasicBlock,
    rootOp: BinaryExpressionOp,
  ): Value[] {
    let suffixStart = operands.length;
    while (suffixStart > 0 && isLiteralValue(operands[suffixStart - 1])) {
      suffixStart--;
    }
    const literalCount = operands.length - suffixStart;
    if (literalCount < 2) return operands;

    const literals = operands.slice(suffixStart);
    const rest = operands.slice(0, suffixStart);

    let acc = (literals[0].def as LiteralOp).value;
    for (let i = 1; i < literals.length; i++) {
      acc = applyBinary(operator, acc, (literals[i].def as LiteralOp).value);
    }

    const env = this.funcOp.moduleIR.environment;
    const mergedPlace = env.createValue();
    const mergedOp = env.createOperation(LiteralOp, mergedPlace, acc);
    // Insert just before the root op in its own block: LiteralOp has
    // no operands so SSA dominance is trivial, and placing it at the
    // root op's position guarantees codegen emits it before any user.
    const rootIndex = block.operations.indexOf(rootOp);
    block.insertOpAt(rootIndex, mergedOp);
    return [...rest, mergedPlace];
  }

  /**
   * Rebuild a left-leaning binary tree from a sorted operand list,
   * taking ownership of the root op's result place and id. Produces:
   *
   *   - a `LiteralOp` if the list collapsed to a single literal,
   *   - a pass-through (no change) if the rebuilt shape matches the
   *     original root,
   *   - a new `BinaryExpressionOp` (for 2-operand lists) or a chain
   *     of them (for 3+).
   */
  private rebuild(operands: Value[], root: BinaryExpressionOp): BinaryExpressionOp | LiteralOp {
    const env = this.funcOp.moduleIR.environment;
    if (operands.length === 1) {
      const only = operands[0];
      if (isLiteralValue(only)) {
        // Reuse the root's place so users keep pointing at it.
        return new LiteralOp(root.id, root.place, (only.def as LiteralOp).value);
      }
      // Single non-literal — can't replace a binary op with a bare
      // Value here; leave the chain alone. (Happens only if the
      // operator has an absorbing element that collapsed everything,
      // which doesn't occur for *, &, |, ^.)
      return root;
    }
    // Two operands — if they match the root's existing order, no-op.
    if (operands.length === 2 && operands[0] === root.left && operands[1] === root.right) {
      return root;
    }
    // Build left-leaning: ((op[0] ○ op[1]) ○ op[2]) ○ …
    let leftPlace = operands[0];
    for (let i = 1; i < operands.length - 1; i++) {
      const intermediate = env.createOperation(
        BinaryExpressionOp,
        env.createValue(),
        root.operator,
        leftPlace,
        operands[i],
      );
      // Each intermediate goes into the same block as the root so
      // SSA dominance is trivially preserved.
      root.parentBlock!.insertOpAt(root.parentBlock!.operations.indexOf(root), intermediate);
      leftPlace = intermediate.place;
    }
    // The final op reuses the root's place and id so every existing
    // user of `root.place` keeps pointing at it — no users need
    // updating.
    return new BinaryExpressionOp(
      root.id,
      root.place,
      root.operator,
      leftPlace,
      operands[operands.length - 1],
    );
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Commutative + associative + JS-type-safe. Excludes `+` (polymorphic),
 * shifts (not associative), comparison (not associative), logical
 * short-circuit ops.
 */
function isReassociatable(op: BinaryOperator): boolean {
  return op === "*" || op === "&" || op === "|" || op === "^";
}

function isLiteralValue(v: Value): boolean {
  return v.def instanceof LiteralOp;
}

/**
 * Rank determines sort order. Literals rank `+Infinity` so they
 * cluster at the tail and {@link mergeLiterals} can fold them in
 * one pass. Other values sort by stable `Value.id` — monotonic
 * with creation order, which in SSA means monotonic with "defined
 * earlier in the function." Earliest-defined sort leftmost.
 */
function rank(v: Value): number {
  if (v.def instanceof LiteralOp) return Number.POSITIVE_INFINITY;
  return v.id;
}

/**
 * Apply a JS-safe, type-stable binary op to two constants. Only
 * called on operators {@link isReassociatable} returns `true` for,
 * so the switch is exhaustive over that set.
 */
function applyBinary(op: BinaryOperator, a: TPrimitiveValue, b: TPrimitiveValue): TPrimitiveValue {
  switch (op) {
    case "*":
      return (a as number) * (b as number);
    case "&":
      return (a as number) & (b as number);
    case "|":
      return (a as number) | (b as number);
    case "^":
      return (a as number) ^ (b as number);
    default:
      throw new Error(`ReassociationPass: non-reassociatable operator ${op}`);
  }
}
