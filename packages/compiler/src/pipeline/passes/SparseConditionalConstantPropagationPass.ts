import { CompilerOptions } from "../../compile";
import { ProjectUnit } from "../../frontend/ProjectBuilder";
import {
  Operation,
  BinaryExpressionOp,
  BlockId,
  BranchOp,
  ExportDefaultDeclarationOp,
  ExportNamedDeclarationOp,
  ExportSpecifierOp,
  Identifier,
  IdentifierId,
  JumpOp,
  LiteralOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadPhiOp,
  LogicalExpressionOp,
  Place,
  StoreLocalOp,
  TPrimitiveValue,
  UnaryExpressionOp,
} from "../../ir";
import { isTerminal, Terminal } from "../../ir/ops/control";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { TemplateElement, TemplateLiteralOp } from "../../ir/ops/prim/TemplateLiteral";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { DominatorTreeAnalysis } from "../analysis/DominatorTreeAnalysis";
import { LoopInfoAnalysis } from "../analysis/LoopInfoAnalysis";
import { BaseOptimizationPass } from "../late-optimizer/OptimizationPass";
import { Phi } from "../ssa/Phi";
import { SSA } from "../ssa/SSABuilder";
import { resolveBuiltinConstant } from "./resolveBuiltinConstant";
import type { ResolveConstantContext } from "./resolveConstant";

// ---------------------------------------------------------------------------
// Lattice
// ---------------------------------------------------------------------------

const TOP = Symbol("top");
const BOTTOM = Symbol("bottom");

type LatticeValue = typeof TOP | typeof BOTTOM | TPrimitiveValue;

function meet(a: LatticeValue, b: LatticeValue): LatticeValue {
  if (a === TOP) return b;
  if (b === TOP) return a;
  if (a === BOTTOM || b === BOTTOM) return BOTTOM;
  return Object.is(a, b) ? a : BOTTOM;
}

function isConstant(v: LatticeValue): v is TPrimitiveValue {
  return v !== TOP && v !== BOTTOM;
}

// ---------------------------------------------------------------------------
// Pass
// ---------------------------------------------------------------------------

/**
 * Sparse Conditional Constant Propagation (Wegman & Zadeck, 1991).
 *
 * Uses two worklists:
 *   - **CFG worklist**: edges (from, to) that have become executable.
 *   - **SSA worklist**: identifiers whose lattice value changed, driving
 *     re-evaluation of their users via the embedded {@link Identifier.uses}
 *     chain.
 *
 * Compared to simple constant propagation, SCCP:
 *   - Never evaluates instructions in unreachable blocks.
 *   - Ignores phi operands from non-executable edges (treats them as TOP).
 *   - Folds branches with constant tests and degrades resulting
 *     single-operand phis.
 */
export class SparseConditionalConstantPropagationPass extends BaseOptimizationPass {
  private readonly lattice = new Map<IdentifierId, LatticeValue>();
  private readonly executableEdges = new Set<string>();
  private readonly executableBlocks = new Set<BlockId>();
  /** Instructions resolved to constants by the resolveConstant hook. */
  private readonly hookResolved = new Set<IdentifierId>();
  private readonly resolveConstantCtx: ResolveConstantContext;

  /** SSA worklist: identifiers whose lattice value changed. */
  private readonly ssaWorklist: Identifier[] = [];
  /** CFG worklist: edges that became executable. */
  private readonly cfgWorklist: [BlockId | null, BlockId][] = [];

  /** Map from phi operand identifier → phis that read it. */
  private phiUsers = new Map<IdentifierId, Phi[]>();
  /** Map from block → phis whose merge point is that block. */
  private phisByBlock = new Map<BlockId, Phi[]>();
  /** Map from instruction/terminal → block it belongs to. */
  private userBlock = new Map<object, BlockId>();

  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly moduleUnit: ModuleIR,
    private readonly projectUnit: ProjectUnit,
    private readonly ssa: SSA,
    private readonly context: Map<string, any>,
    private readonly options: CompilerOptions,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
    this.resolveConstantCtx = {
      set: () => {
        throw new Error("set() can only be called during resolveConstant hook invocation");
      },
      get: (place: Place) => {
        const v = this.getLattice(place.identifier.id);
        return isConstant(v) ? v : undefined;
      },
      has: (place: Place) => isConstant(this.getLattice(place.identifier.id)),
      environment: this.moduleUnit.environment,
    };
  }

  // -------------------------------------------------------------------------
  // BaseOptimizationPass interface
  // -------------------------------------------------------------------------

  protected step() {
    if (!this.context.has("constants")) {
      this.context.set("constants", new Map<string, Map<IdentifierId, TPrimitiveValue>>());
    }

    this.lattice.clear();
    this.executableEdges.clear();
    this.executableBlocks.clear();
    this.hookResolved.clear();
    this.ssaWorklist.length = 0;
    this.cfgWorklist.length = 0;

    // Build auxiliary maps for worklist propagation.
    this.buildAuxMaps();

    // Parameters and captures are external — initialize to BOTTOM.
    for (const param of this.functionIR.runtime.params) {
      this.setLattice(param.identifier, BOTTOM);
    }
    for (const capture of this.functionIR.runtime.captureParams) {
      this.setLattice(capture.identifier, BOTTOM);
    }

    // Drain any SSA worklist items from parameter initialization.
    this.ssaWorklist.length = 0;

    // Seed the CFG worklist with the entry edge.
    this.cfgWorklist.push([null, this.functionIR.entryBlockId]);

    // Main loop: pick from either worklist until both are empty.
    while (this.cfgWorklist.length > 0 || this.ssaWorklist.length > 0) {
      if (this.cfgWorklist.length > 0) {
        this.processCFGEdge();
      } else {
        this.processSSAItem();
      }
    }

    const irChanged = this.applyResults();
    return { changed: irChanged };
  }

  // -------------------------------------------------------------------------
  // Auxiliary maps
  // -------------------------------------------------------------------------

  private buildAuxMaps(): void {
    // Phi users: operand identifier → phis that read it.
    // Phis by block: block → phis whose merge point is that block.
    this.phiUsers.clear();
    this.phisByBlock.clear();
    for (const phi of this.ssa.phis) {
      for (const [, operand] of phi.operands) {
        let arr = this.phiUsers.get(operand.identifier.id);
        if (!arr) {
          arr = [];
          this.phiUsers.set(operand.identifier.id, arr);
        }
        arr.push(phi);
      }
      let blockPhis = this.phisByBlock.get(phi.blockId);
      if (!blockPhis) {
        blockPhis = [];
        this.phisByBlock.set(phi.blockId, blockPhis);
      }
      blockPhis.push(phi);
    }

    // Instruction/terminal → block mapping.
    this.userBlock.clear();
    for (const block of this.functionIR.allBlocks()) {
      const blockId = block.id;
      for (const instr of block.operations) {
        this.userBlock.set(instr, blockId);
      }
      if (block.terminal) {
        this.userBlock.set(block.terminal, blockId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // CFG worklist
  // -------------------------------------------------------------------------

  /** Process a single CFG edge from the worklist. */
  private processCFGEdge(): void {
    const [from, to] = this.cfgWorklist.pop()!;
    const edgeKey = `${from}→${to}`;
    if (this.executableEdges.has(edgeKey)) return;
    this.executableEdges.add(edgeKey);

    const newlyReachable = !this.executableBlocks.has(to);
    this.executableBlocks.add(to);

    // Re-evaluate phis in target block (new incoming edge).
    const blockPhis = this.phisByBlock.get(to);
    if (blockPhis) {
      for (const phi of blockPhis) this.evaluatePhi(phi);
    }

    if (newlyReachable) {
      const block = this.functionIR.getBlock(to);
      for (const instr of block.operations) {
        this.evaluateInstruction(instr);
      }
      this.evaluateTerminal(to, block);
    }
  }

  // -------------------------------------------------------------------------
  // SSA worklist
  // -------------------------------------------------------------------------

  /** Process a single identifier from the SSA worklist. */
  private processSSAItem(): void {
    const identifier = this.ssaWorklist.pop()!;

    // Re-evaluate phi users of this identifier.
    const phis = this.phiUsers.get(identifier.id);
    if (phis) {
      for (const phi of phis) {
        if (this.executableBlocks.has(phi.blockId)) {
          this.evaluatePhi(phi);
        }
      }
    }

    // Re-evaluate instruction/terminal users via embedded use-chain.
    for (const user of identifier.uses) {
      const blockId = this.userBlock.get(user);
      if (blockId === undefined || !this.executableBlocks.has(blockId)) continue;

      if (isTerminal(user)) {
        this.evaluateTerminal(blockId, { terminal: user });
      } else if (user instanceof Operation && user.place !== undefined) {
        this.evaluateInstruction(user);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Edge marking
  // -------------------------------------------------------------------------

  private markEdgeExecutable(from: BlockId | null, to: BlockId): void {
    const key = `${from}→${to}`;
    if (!this.executableEdges.has(key)) {
      this.cfgWorklist.push([from, to]);
    }
  }

  // -------------------------------------------------------------------------
  // Phi evaluation
  // -------------------------------------------------------------------------

  private evaluatePhi(phi: Phi): void {
    let result: LatticeValue = TOP;
    for (const [predBlockId, operandPlace] of phi.operands) {
      if (!this.executableEdges.has(`${predBlockId}→${phi.blockId}`)) continue;
      result = meet(result, this.getLattice(operandPlace.identifier.id));
      if (result === BOTTOM) break;
    }
    this.setLattice(phi.place.identifier, result);
  }

  // -------------------------------------------------------------------------
  // Terminal evaluation
  // -------------------------------------------------------------------------

  private evaluateTerminal(blockId: BlockId, block: { terminal?: Terminal }): void {
    const terminal = block.terminal;
    if (!terminal) return;

    if (terminal instanceof BranchOp) {
      const testVal = this.getLattice(terminal.test.identifier.id);
      if (isConstant(testVal)) {
        // Constant test — only the taken path is executable.
        this.markEdgeExecutable(blockId, testVal ? terminal.consequent : terminal.alternate);
      } else if (testVal === BOTTOM) {
        // Non-constant — both paths are executable.
        this.markEdgeExecutable(blockId, terminal.consequent);
        this.markEdgeExecutable(blockId, terminal.alternate);
      }
      // TOP — test not yet resolved; don't mark either edge.
      // The SSA worklist will re-evaluate when the test gets a value.
      return;
    }

    for (const ref of terminal.getBlockRefs()) {
      this.markEdgeExecutable(blockId, ref);
    }
  }

  // -------------------------------------------------------------------------
  // Instruction evaluation
  // -------------------------------------------------------------------------

  private evaluateInstruction(instr: Operation): void {
    const resolvedValue = this.tryResolveConstant(instr);
    if (resolvedValue !== undefined || this.hookResolved.has(instr.place!.identifier.id)) {
      this.setLattice(instr.place!.identifier, resolvedValue);
      return;
    }

    if (instr instanceof LiteralOp) {
      this.setLattice(instr.place.identifier, instr.value);
      return;
    }
    if (instr instanceof BinaryExpressionOp) {
      this.evaluateBinary(instr);
      return;
    }
    if (instr instanceof UnaryExpressionOp) {
      this.evaluateUnary(instr);
      return;
    }
    if (instr instanceof LogicalExpressionOp) {
      this.evaluateLogical(instr);
      return;
    }
    if (instr instanceof TemplateLiteralOp) {
      this.evaluateTemplateLiteral(instr);
      return;
    }
    if (instr instanceof LoadGlobalOp) {
      this.evaluateLoadGlobal(instr);
      return;
    }
    if (instr instanceof StoreLocalOp) {
      this.evaluateStoreLocal(instr);
      return;
    }
    if (instr instanceof LoadLocalOp) {
      this.evaluateLoadLocal(instr);
      return;
    }
    if (instr instanceof LoadPhiOp) {
      this.evaluateLoadPhi(instr);
      return;
    }
    if (instr instanceof ExportDefaultDeclarationOp) {
      this.evaluateExportDefault(instr);
      return;
    }
    if (instr instanceof ExportSpecifierOp) {
      this.evaluateExportSpecifier(instr);
      return;
    }
    if (instr instanceof ExportNamedDeclarationOp) {
      this.evaluateExportNamed(instr);
      return;
    }

    // Unhandled instruction. If it reads operands, it computes a value
    // we can't fold → BOTTOM. If it reads nothing (e.g. BindingIdentifier),
    // it's a structural declaration whose value comes from a StoreLocal
    // later → leave as TOP until that store executes.
    if (instr.getOperands().length > 0) {
      this.setLattice(instr.place!.identifier, BOTTOM);
    }
  }

  private tryResolveConstant(instr: Operation): TPrimitiveValue | undefined {
    let resolvedValue: TPrimitiveValue | undefined;
    let resolved = false;

    this.resolveConstantCtx.set = (value: TPrimitiveValue) => {
      resolvedValue = value;
      resolved = true;
    };

    try {
      this.options.resolveConstant?.(instr, this.resolveConstantCtx);
      if (!resolved) {
        resolveBuiltinConstant(instr, this.moduleUnit, this.resolveConstantCtx);
      }
    } finally {
      this.resolveConstantCtx.set = () => {
        throw new Error("set() can only be called during resolveConstant hook invocation");
      };
    }

    if (resolved) {
      this.hookResolved.add(instr.place!.identifier.id);
      return resolvedValue;
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Lattice helpers
  // -------------------------------------------------------------------------

  private getLattice(id: IdentifierId): LatticeValue {
    return this.lattice.has(id) ? this.lattice.get(id)! : TOP;
  }

  /**
   * Meet the new value into the lattice cell. If the cell changes, add
   * the identifier to the SSA worklist so its users are re-evaluated.
   */
  private setLattice(identifier: Identifier, value: LatticeValue): void {
    const prev = this.lattice.has(identifier.id) ? this.lattice.get(identifier.id)! : TOP;
    const next = meet(prev, value);
    if (Object.is(next, prev)) return;
    this.lattice.set(identifier.id, next);
    this.ssaWorklist.push(identifier);
  }

  // -------------------------------------------------------------------------
  // Apply results
  // -------------------------------------------------------------------------

  private applyResults(): boolean {
    let changed = false;
    this.exportConstants();

    const domTree = this.AM.get(DominatorTreeAnalysis, this.functionIR);
    const loopInfo = this.AM.get(LoopInfoAnalysis, this.functionIR);

    for (const block of this.functionIR.allBlocks()) {
      const blockId = block.id;
      // Replace constant-valued instructions with literals.
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];
        const val = this.getLattice(instr.place!.identifier.id);
        if (!isConstant(val)) continue;
        if (instr instanceof LiteralOp) continue;

        const canReplace =
          this.hookResolved.has(instr.place!.identifier.id) ||
          instr instanceof BinaryExpressionOp ||
          // UnaryExpression is replaceable only when pure. `void expr`
          // propagates side effects from its operand, so `void fetch()`
          // must not be replaced with `undefined` (that drops the fetch).
          (instr instanceof UnaryExpressionOp &&
            !instr.hasSideEffects(this.moduleUnit.environment)) ||
          instr instanceof LogicalExpressionOp ||
          instr instanceof LoadLocalOp ||
          instr instanceof LoadPhiOp ||
          instr instanceof LoadGlobalOp ||
          instr instanceof TemplateLiteralOp;
        if (!canReplace) continue;

        block.replaceOp(i, new LiteralOp(instr.id, instr.place!, val));
        changed = true;
      }

      // Partial-fold template literals.
      for (let i = 0; i < block.operations.length; i++) {
        const instr = block.operations[i];
        if (!(instr instanceof TemplateLiteralOp)) continue;
        if (instr.expressions.length === 0) continue;

        let anyConstant = false;
        let allConstant = true;
        for (const expr of instr.expressions) {
          if (isConstant(this.getLattice(expr.identifier.id))) {
            anyConstant = true;
          } else {
            allConstant = false;
          }
        }
        if (allConstant || !anyConstant) continue;

        const newQuasis: TemplateElement[] = [];
        const newExpressions: Place[] = [];
        let pending = instr.quasis[0].value.cooked ?? instr.quasis[0].value.raw;

        for (let j = 0; j < instr.expressions.length; j++) {
          const expr = instr.expressions[j];
          const next = instr.quasis[j + 1].value.cooked ?? instr.quasis[j + 1].value.raw;
          const val = this.getLattice(expr.identifier.id);
          if (isConstant(val)) {
            pending += String(val) + next;
          } else {
            newQuasis.push(templateElement(pending, false));
            newExpressions.push(expr);
            pending = next;
          }
        }
        newQuasis.push(templateElement(pending, true));

        block.replaceOp(i, new TemplateLiteralOp(instr.id, instr.place, newQuasis, newExpressions));
        changed = true;
      }

      // Fold branches with constant tests (skip loop headers).
      if (block.terminal instanceof BranchOp) {
        if (loopInfo.getBackEdgePredecessors(blockId).size > 0) continue;

        const testVal = this.getLattice(block.terminal.test.identifier.id);
        if (isConstant(testVal)) {
          const terminal = block.terminal;
          const deadBlockId = testVal ? terminal.alternate : terminal.consequent;
          block.terminal = new JumpOp(
            terminal.id,
            testVal ? terminal.consequent : terminal.alternate,
          );

          for (const phi of this.ssa.phis) {
            if (phi.blockId === deadBlockId) {
              this.ssa.phis.delete(phi);
              continue;
            }
            for (const [operandBlockId] of phi.operands) {
              if (domTree.dominates(deadBlockId, operandBlockId)) {
                const result = phi.removeOperand(operandBlockId);
                if (result === "single") {
                  this.degradeSingleOperandPhi(phi);
                } else if (result === "empty") {
                  this.ssa.phis.delete(phi);
                }
              }
            }
          }
          changed = true;
        }
      }
    }
    return changed;
  }

  private degradeSingleOperandPhi(phi: Phi) {
    const singleOperandPlace = phi.getSingleOperand();
    const phiBlock = this.functionIR.getBlock(phi.blockId);

    const rewriteMap = new Map<Identifier, Place>();
    rewriteMap.set(phi.place.identifier, singleOperandPlace);

    for (let i = 0; i < phiBlock.operations.length; i++) {
      const instr = phiBlock.operations[i];
      if (instr instanceof LoadPhiOp && phi.place.id === instr.value.id) {
        phiBlock.replaceOp(i, new LoadLocalOp(instr.id, instr.place, singleOperandPlace));
      } else {
        const rewritten = instr.rewrite(rewriteMap);
        if (rewritten !== instr) phiBlock.replaceOp(i, rewritten);
      }
    }
    if (phiBlock.terminal) {
      phiBlock.replaceTerminal(phiBlock.terminal.rewrite(rewriteMap));
    }
    this.ssa.phis.delete(phi);
  }

  private exportConstants() {
    let globalConstants = this.context.get("constants") as Map<
      string,
      Map<IdentifierId, TPrimitiveValue>
    >;
    if (!globalConstants) {
      globalConstants = new Map();
      this.context.set("constants", globalConstants);
    }
    let moduleConstants = globalConstants.get(this.moduleUnit.path);
    if (!moduleConstants) {
      moduleConstants = new Map();
      globalConstants.set(this.moduleUnit.path, moduleConstants);
    }
    for (const [id, val] of this.lattice) {
      if (isConstant(val)) moduleConstants.set(id, val);
    }
  }

  // -------------------------------------------------------------------------
  // Instruction evaluators
  // -------------------------------------------------------------------------

  private evaluateBinary(instr: BinaryExpressionOp): void {
    const left = this.getLattice(instr.left.identifier.id);
    const right = this.getLattice(instr.right.identifier.id);
    if (left === TOP || right === TOP) return;
    if (left === BOTTOM || right === BOTTOM) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }

    let result: TPrimitiveValue;
    switch (instr.operator) {
      case "==":
        result = left == right;
        break;
      case "!=":
        result = left != right;
        break;
      case "===":
        result = left === right;
        break;
      case "!==":
        result = left !== right;
        break;
      case "+":
        result = (left as number) + (right as number);
        break;
      case "-":
        result = (left as number) - (right as number);
        break;
      case "*":
        result = (left as number) * (right as number);
        break;
      case "/":
        result = (left as number) / (right as number);
        break;
      case "%":
        result = (left as number) % (right as number);
        break;
      case "**":
        result = (left as number) ** (right as number);
        break;
      case "|":
        result = (left as number) | (right as number);
        break;
      case "&":
        result = (left as number) & (right as number);
        break;
      case "^":
        result = (left as number) ^ (right as number);
        break;
      case ">>":
        result = (left as number) >> (right as number);
        break;
      case ">>>":
        result = (left as number) >>> (right as number);
        break;
      case "<<":
        result = (left as number) << (right as number);
        break;
      case ">":
        result = (left as number) > (right as number);
        break;
      case ">=":
        result = (left as number) >= (right as number);
        break;
      case "<":
        result = (left as number) < (right as number);
        break;
      case "<=":
        result = (left as number) <= (right as number);
        break;
      default:
        this.setLattice(instr.place.identifier, BOTTOM);
        return;
    }
    this.setLattice(instr.place.identifier, result);
  }

  private evaluateUnary(instr: UnaryExpressionOp): void {
    if (instr.operator === "void") {
      this.setLattice(instr.place.identifier, undefined);
      return;
    }

    const operand = this.getLattice(instr.argument.identifier.id);
    if (operand === TOP) return;
    if (operand === BOTTOM) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    let result: TPrimitiveValue;
    switch (instr.operator) {
      case "!":
        result = !operand;
        break;
      case "-":
        result = -(operand as number);
        break;
      case "~":
        result = ~(operand as number);
        break;
      case "+":
        result = +(operand as number);
        break;
      case "typeof":
        result = typeof operand;
        break;
      default:
        this.setLattice(instr.place.identifier, BOTTOM);
        return;
    }
    this.setLattice(instr.place.identifier, result);
  }

  private evaluateLogical(instr: LogicalExpressionOp): void {
    const left = this.getLattice(instr.left.identifier.id);
    const right = this.getLattice(instr.right.identifier.id);
    if (left === TOP || right === TOP) return;
    if (left === BOTTOM || right === BOTTOM) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    let result: TPrimitiveValue;
    switch (instr.operator) {
      case "&&":
        result = left && right;
        break;
      case "||":
        result = left || right;
        break;
      case "??":
        result = left ?? right;
        break;
      default:
        this.setLattice(instr.place.identifier, BOTTOM);
        return;
    }
    this.setLattice(instr.place.identifier, result);
  }

  private evaluateTemplateLiteral(instr: TemplateLiteralOp): void {
    if (instr.expressions.length === 0) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    for (const expr of instr.expressions) {
      const val = this.getLattice(expr.identifier.id);
      if (val === TOP) return;
      if (val === BOTTOM) {
        this.setLattice(instr.place.identifier, BOTTOM);
        return;
      }
    }
    let result = "";
    for (let i = 0; i < instr.quasis.length; i++) {
      result += instr.quasis[i].value.cooked ?? instr.quasis[i].value.raw;
      if (i < instr.expressions.length)
        result += String(this.getLattice(instr.expressions[i].identifier.id));
    }
    this.setLattice(instr.place.identifier, result);
  }

  private evaluateLoadGlobal(instr: LoadGlobalOp): void {
    const global = this.moduleUnit.globals.get(instr.name);
    if (!global || global.kind === "builtin") {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    const globalConstants = this.context.get("constants") as
      | Map<string, Map<IdentifierId, TPrimitiveValue>>
      | undefined;
    const constantsForSource = globalConstants?.get(global.source);
    if (!constantsForSource) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    const moduleUnit = this.projectUnit.modules.get(global.source);
    const moduleExport = moduleUnit?.exports.get(global.name);
    if (!moduleExport) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    const id = moduleExport.instruction.place!.identifier.id;
    if (!constantsForSource.has(id)) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    this.setLattice(instr.place.identifier, constantsForSource.get(id)!);
  }

  private evaluateStoreLocal(instr: StoreLocalOp): void {
    const val = this.getLattice(instr.value.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
    this.setLattice(instr.lval.identifier, val);
  }

  private evaluateLoadLocal(instr: LoadLocalOp): void {
    const val = this.getLattice(instr.value.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
  }

  private evaluateLoadPhi(instr: LoadPhiOp): void {
    const val = this.getLattice(instr.value.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
  }

  private evaluateExportSpecifier(instr: ExportSpecifierOp): void {
    const moduleExport = this.moduleUnit.exports.get(instr.exported);
    if (!moduleExport?.declaration) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    const val = this.getLattice(moduleExport.declaration.place!.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
  }

  private evaluateExportDefault(instr: ExportDefaultDeclarationOp): void {
    const val = this.getLattice(instr.declaration.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
  }

  private evaluateExportNamed(instr: ExportNamedDeclarationOp): void {
    if (!instr.declaration) {
      this.setLattice(instr.place.identifier, BOTTOM);
      return;
    }
    const val = this.getLattice(instr.declaration.identifier.id);
    if (val === TOP) return;
    this.setLattice(instr.place.identifier, val);
  }
}

function templateElement(text: string, tail: boolean): TemplateElement {
  return { value: { raw: text, cooked: text }, tail };
}
