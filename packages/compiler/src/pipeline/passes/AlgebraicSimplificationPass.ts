import {
  Operation,
  BasicBlock,
  BinaryExpressionOp,
  ValueId,
  LiteralOp,
  LoadLocalOp,
  LogicalExpressionOp,
  StoreLocalOp,
  TPrimitiveValue,
} from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { Value } from "../../ir/core/Value";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { MutabilityAnalysis, MutabilityInfo } from "../analysis/MutabilityAnalysis";
import { BaseOptimizationPass } from "../late-optimizer/OptimizationPass";

/**
 * A pass that simplifies algebraic expressions where one operand is a known
 * literal and the other is not, using identity and annihilator rules.
 *
 * Examples:
 * - `x + 0` → `x`, `0 + x` → `x`
 * - `x - 0` → `x`
 * - `x * 1` → `x`, `1 * x` → `x`
 * - `x * 0` → `0` (when x is finite)
 * - `x | 0` → `x`, `x ^ 0` → `x`
 * - `x & 0` → `0`
 * - `x ** 1` → `x`, `x ** 0` → `1` (when x is finite)
 * - `true && x` → `x`, `false && x` → `false`
 * - `false || x` → `x`, `true || x` → `true`
 * - `null ?? x` → `x`
 *
 * This pass does NOT handle:
 * - Constant folding (both operands known) — handled by ConstantPropagationPass
 * - Strength reduction (e.g. `x ** 2` → `x * x`) — separate concern
 * - Unary constant folding (e.g. `!true`) — handled by ConstantPropagationPass
 */
export class AlgebraicSimplificationPass extends BaseOptimizationPass {
  /**
   * Maps identifier ids to their known literal values.
   * Tracks values through LiteralOp, LoadLocal, and StoreLocal chains.
   */
  private readonly literals: Map<ValueId, TPrimitiveValue>;

  private readonly mutability: MutabilityInfo;

  constructor(
    protected readonly funcOp: FuncOp,
    private readonly AM: AnalysisManager,
  ) {
    super(funcOp);
    this.literals = new Map();
    this.mutability = this.AM.get(MutabilityAnalysis, this.funcOp);

    // Pre-scan to find literal values. Walk every op — including
    // ops inside structured ops' regions — uniformly.
    this.seedLiterals(this.funcOp);
  }

  private seedLiterals(funcOp: FuncOp): void {
    const walkOps = (ops: readonly Operation[]) => {
      for (const op of ops) {
        if (op instanceof LiteralOp) {
          this.literals.set(op.place.id, op.value);
        } else if (op instanceof LoadLocalOp) {
          const val = this.literals.get(op.value.id);
          if (val !== undefined) {
            this.literals.set(op.place.id, val);
          }
        } else if (op instanceof StoreLocalOp) {
          // Only track literal values through source bindings with
          // a single store in the function body. That is the
          // declarationId-layer "true SSA binding" query — the
          // IR-level `type === "const"` flag is not sufficient
          // because reassignments can share a declarationId and
          // because the frontend may emit non-"let" types on
          // assignment stores.
          if (this.mutability.isSingleAssignment(op.lval.declarationId)) {
            const val = this.literals.get(op.value.id);
            if (val !== undefined) {
              this.literals.set(op.lval.id, val);
            }
          }
        }
        for (const region of op.regions) {
          for (const block of region.blocks) {
            walkOps(block.operations);
          }
        }
      }
    };
    for (const block of funcOp.allBlocks()) {
      walkOps(block.operations);
    }
  }

  public step() {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      changed ||= this.simplifyBlock(block);
    }

    return { changed };
  }

  private simplifyBlock(block: BasicBlock): boolean {
    let changed = false;

    for (const instruction of block.operations) {
      let replacement: Operation | undefined;

      if (instruction instanceof BinaryExpressionOp) {
        replacement = this.simplifyBinaryExpression(instruction);
      } else if (instruction instanceof LogicalExpressionOp) {
        replacement = this.simplifyLogicalExpression(instruction);
      }

      if (replacement !== undefined) {
        block.replaceOp(instruction, replacement);
        if (replacement instanceof LiteralOp) {
          this.literals.set(replacement.place.id, replacement.value);
        }
        changed = true;
      }
    }

    return changed;
  }

  private getLiteral(place: Value): TPrimitiveValue | undefined {
    return this.literals.get(place.id);
  }

  private isLiteral(place: Value): boolean {
    return this.literals.has(place.id);
  }

  private isLiteralNumber(place: Value): boolean {
    if (!this.isLiteral(place)) return false;
    const val = this.getLiteral(place);
    return typeof val === "number";
  }

  private isInt32Literal(place: Value): boolean {
    if (!this.isLiteralNumber(place)) return false;
    const val = this.getLiteral(place) as number;
    return Number.isInteger(val) && val >= -2147483648 && val <= 2147483647;
  }

  private isFiniteNumber(place: Value): boolean {
    if (!this.isLiteralNumber(place)) return false;
    const val = this.getLiteral(place) as number;
    return Number.isFinite(val);
  }

  private forwardPlace(instruction: Operation, source: Value): Operation {
    return new LoadLocalOp(instruction.id, instruction.place!, source);
  }

  private makeLiteral(instruction: Operation, value: TPrimitiveValue): LiteralOp {
    return new LiteralOp(instruction.id, instruction.place!, value);
  }

  private simplifyBinaryExpression(instruction: BinaryExpressionOp): Operation | undefined {
    const leftLit = this.getLiteral(instruction.left);
    const rightLit = this.getLiteral(instruction.right);
    const leftIsLit = this.isLiteral(instruction.left);
    const rightIsLit = this.isLiteral(instruction.right);

    // Skip if both are known (ConstantPropagationPass handles that)
    // or if neither is known.
    if ((leftIsLit && rightIsLit) || (!leftIsLit && !rightIsLit)) {
      return undefined;
    }

    const op = instruction.operator;

    // Additive identity: x + 0 = x, 0 + x = x
    if (op === "+") {
      if (rightIsLit && rightLit === 0 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
      if (leftIsLit && leftLit === 0 && !rightIsLit) {
        return this.forwardPlace(instruction, instruction.right);
      }
    }

    // Subtractive identity: x - 0 = x
    if (op === "-") {
      if (rightIsLit && rightLit === 0 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
    }

    // Multiplicative identity/annihilator: x * 1 = x, x * 0 = 0
    if (op === "*") {
      if (rightIsLit && rightLit === 1 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
      if (leftIsLit && leftLit === 1 && !rightIsLit) {
        return this.forwardPlace(instruction, instruction.right);
      }
      if (rightIsLit && rightLit === 0 && this.isFiniteNumber(instruction.left)) {
        return this.makeLiteral(instruction, 0);
      }
      if (leftIsLit && leftLit === 0 && this.isFiniteNumber(instruction.right)) {
        return this.makeLiteral(instruction, 0);
      }
    }

    // Bitwise OR identity: x | 0 = x
    if (op === "|") {
      if (rightIsLit && rightLit === 0 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
      if (leftIsLit && leftLit === 0 && !rightIsLit) {
        return this.forwardPlace(instruction, instruction.right);
      }
    }

    // Bitwise AND annihilator: x & 0 = 0
    if (op === "&") {
      if (rightIsLit && rightLit === 0) {
        return this.makeLiteral(instruction, 0);
      }
      if (leftIsLit && leftLit === 0) {
        return this.makeLiteral(instruction, 0);
      }
    }

    // Bitwise XOR identity: x ^ 0 = x
    if (op === "^") {
      if (rightIsLit && rightLit === 0 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
      if (leftIsLit && leftLit === 0 && !rightIsLit) {
        return this.forwardPlace(instruction, instruction.right);
      }
    }

    // Exponentiation identity/annihilator: x ** 1 = x, x ** 0 = 1
    if (op === "**") {
      if (rightIsLit && rightLit === 1 && !leftIsLit) {
        return this.forwardPlace(instruction, instruction.left);
      }
      if (rightIsLit && rightLit === 0 && this.isFiniteNumber(instruction.left)) {
        return this.makeLiteral(instruction, 1);
      }
    }

    return undefined;
  }

  private simplifyLogicalExpression(instruction: LogicalExpressionOp): Operation | undefined {
    const leftLit = this.getLiteral(instruction.left);
    const leftIsLit = this.isLiteral(instruction.left);
    const rightIsLit = this.isLiteral(instruction.right);

    // Only simplify when left is known and right is not.
    // If both are known, ConstantPropagationPass handles it.
    if (!leftIsLit || rightIsLit) {
      return undefined;
    }

    const op = instruction.operator;

    // Short-circuit: true && x = x, false && x = false
    if (op === "&&") {
      if (leftLit) {
        return this.forwardPlace(instruction, instruction.right);
      } else {
        return this.makeLiteral(instruction, leftLit);
      }
    }

    // Short-circuit: true || x = true, false || x = x
    if (op === "||") {
      if (leftLit) {
        return this.makeLiteral(instruction, leftLit);
      } else {
        return this.forwardPlace(instruction, instruction.right);
      }
    }

    // Nullish: null ?? x = x, undefined ?? x = x
    if (op === "??") {
      if (leftLit === null || leftLit === undefined) {
        return this.forwardPlace(instruction, instruction.right);
      } else {
        return this.makeLiteral(instruction, leftLit);
      }
    }

    return undefined;
  }
}
