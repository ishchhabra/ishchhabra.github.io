import {
  DeclareLocalOp,
  LiteralOp,
  LoadLocalOp,
  makeOperationId,
  Operation,
  StoreContextOp,
  StoreLocalOp,
  type BlockId,
} from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { forEachOutgoingEdge } from "./blockArgs";

/**
 * Out-of-SSA lowering.
 *
 * Two independent steps:
 *
 * 1. **Phi destruction** (Sreedhar Method I). For each `block.params`
 *    entry — an SSA phi lowered to a block parameter — declare the
 *    backing `let` at function entry and insert `param = arg` copy
 *    stores at every predecessor's outgoing edge. Placing stores
 *    before the predecessor's terminator works without splitting
 *    critical edges because along any path the *last* store wins.
 *
 * 2. **Intra-block interference preservation**. When an SSA value
 *    loaded from a source variable X is used after a later
 *    `StoreLocal(assignment)` to X within the same block, the naive
 *    LoadLocal-aliases-to-source codegen would emit the post-mutation
 *    value at the use site. We detect this interference and insert a
 *    `const $snap = X;` binding at the LoadLocal's site, rewriting
 *    the LoadLocal to read from the snapshot. This is the
 *    Boissinot-style out-of-SSA interference test applied to plain
 *    intra-block LoadLocals — the post-SSA analogue of phi
 *    congruence-class interference.
 *
 * Together these two steps move the compiler from "Method I phis +
 * blind intra-block aliasing" to "Method I phis + interference-checked
 * intra-block aliasing," which is the minimum needed for the IR to
 * carry the postfix-snapshot invariant as pure SSA rather than forcing
 * the HIR builder to eagerly materialize it.
 */
export class SSAEliminator {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): void {
    this.#eliminatePhis();
    this.#preserveInterferingLoads();
  }

  #eliminatePhis(): void {
    // Collect every (block, param, index-within-block) triple, then
    // process them in identifier-id order. SSABuilder allocates ids
    // monotonically in phi-creation order, so this sort gives a
    // stable per-param traversal independent of block-iteration order.
    type ParamSite = { param: Place; blockId: BlockId; index: number };
    const sites: ParamSite[] = [];
    const entryBlockId = this.funcOp.entryBlockId;
    for (const block of this.funcOp.allBlocks()) {
      // Entry block params are the function's formal parameters
      // (MLIR-style). They flow into the entry block from the
      // caller's implicit edge, which means:
      //   (a) the JS function signature already declares them —
      //       no `let` lowering needed, so `#insertParamDeclaration`
      //       must NOT run for them, and
      //   (b) entry has no real predecessors to walk — no
      //       `param = arg` copy stores to insert.
      // Both cases are handled by skipping the entry block entirely.
      if (block.id === entryBlockId) continue;
      for (let i = 0; i < block.params.length; i++) {
        sites.push({ param: block.params[i], blockId: block.id, index: i });
      }
    }
    sites.sort((a, b) => a.param.identifier.id - b.param.identifier.id);

    // Precompute "which predecessor blocks target each merge block
    // (with which arg list)" so per-param store emission is O(preds).
    const incomingEdges = this.#buildIncomingEdgeIndex();

    for (const { param, blockId, index } of sites) {
      this.#insertParamDeclaration(param);

      for (const { predBlock, args } of incomingEdges.get(blockId) ?? []) {
        const arg = args[index] ?? param;
        // Defensive self-store filter for degenerate `arg = param`
        // edges produced by later passes.
        if (arg.identifier.id === param.identifier.id) continue;
        this.#insertCopyStore(predBlock, param, arg);
      }
    }
  }

  /**
   * Walk every block's terminator and index incoming edges by
   * destination block id. For each destination, records the
   * predecessor block and the arg list that flows along that edge.
   * A single predecessor may have multiple edges to the same
   * destination (e.g., switch cases that fall through); each is
   * recorded separately so its args feed param stores independently.
   */
  #buildIncomingEdgeIndex(): Map<BlockId, { predBlock: BasicBlock; args: readonly Place[] }[]> {
    const index = new Map<BlockId, { predBlock: BasicBlock; args: readonly Place[] }[]>();
    for (const predBlock of this.funcOp.allBlocks()) {
      forEachOutgoingEdge(predBlock, (succId, args) => {
        let list = index.get(succId);
        if (list === undefined) {
          list = [];
          index.set(succId, list);
        }
        list.push({ predBlock, args });
      });
    }
    return index;
  }

  #insertParamDeclaration(param: Place): void {
    const origDeclId = param.identifier.originalDeclarationId;
    if (origDeclId === undefined) {
      throw new Error(`Block param ${param.identifier.name} is missing originalDeclarationId`);
    }

    // Synthetic phi lets are hoisted to the function entry block so
    // their JS scope dominates every store site. SSABuilder may
    // route undef contributions through the function-wide undef
    // seed at predecessors that live in any region (e.g. a loop
    // preheader before the source-level `let`'s scope), so placing
    // the `let` at the source variable's declaration site would
    // leave those stores outside the JS scope of the declaration.
    // The function entry dominates everything.
    const declarationBlock = this.funcOp.getBlock(this.funcOp.entryBlockId);
    this.moduleIR.environment.ensureSyntheticDeclarationMetadata(
      param.identifier.declarationId,
      "let",
      param,
    );

    const undefinedId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const undefinedPlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(),
    );
    const undefinedInstr = new LiteralOp(undefinedId, undefinedPlace, undefined);
    declarationBlock.appendOp(undefinedInstr);
    this.moduleIR.environment.placeToOp.set(undefinedPlace.id, undefinedInstr);

    const storeId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const storePlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(param.identifier.declarationId),
    );
    const storeInstr = new StoreLocalOp(
      storeId,
      storePlace,
      param,
      undefinedPlace,
      "let",
      "declaration",
    );
    declarationBlock.appendOp(storeInstr);
    this.moduleIR.environment.placeToOp.set(storePlace.id, storeInstr);
  }

  #insertCopyStore(predBlock: BasicBlock, param: Place, arg: Place): void {
    const storeId = makeOperationId(this.moduleIR.environment.nextOperationId++);
    const storePlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(param.identifier.declarationId),
    );
    const storeInstr = new StoreLocalOp(storeId, storePlace, param, arg, "let", "assignment");
    predBlock.appendOp(storeInstr);
    this.moduleIR.environment.placeToOp.set(storePlace.id, storeInstr);
  }

  // ---------------------------------------------------------------------
  // Intra-block interference preservation
  // ---------------------------------------------------------------------

  /**
   * For every `LoadLocalOp` in every block, check whether any
   * `StoreLocal(assignment)` / `StoreContext(assignment)` to the load's
   * source declaration lies between the load and its last in-block use.
   * If so, materialize a `const $snap = source;` binding at the load
   * site and rewire the LoadLocal to read from `$snap`.
   *
   * This preserves the pre-mutation value in a distinct runtime binding,
   * which codegen's zero-cost LoadLocal aliasing can then safely use.
   */
  #preserveInterferingLoads(): void {
    for (const block of this.funcOp.allBlocks()) {
      this.#preserveInterferingLoadsInBlock(block);
    }
  }

  #preserveInterferingLoadsInBlock(block: BasicBlock): void {
    // Walk by index; we may insert a declaration right before the current
    // LoadLocal, so advance past the inserts.
    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (!(op instanceof LoadLocalOp)) continue;
      if (!this.#interferes(block, op, i)) continue;

      const inserted = this.#materializeLoadSnapshot(block, op, i);
      i += inserted;
    }
  }

  /**
   * True iff a store to `load`'s source declaration lies between
   * `load`'s position and the last position (within this block) that
   * reads `load`'s result. Cross-block uses are treated as interfering —
   * the value must outlive the block, so we can't prove no mutation
   * reaches the consumer.
   */
  #interferes(block: BasicBlock, load: LoadLocalOp, defIdx: number): boolean {
    const resultId = load.place.identifier;
    if (resultId.uses.size === 0) return false;

    const srcDecl = load.value.identifier.declarationId;
    const ops = block.operations;

    let lastUseIdx = -1;
    for (const user of resultId.uses) {
      if (!(user instanceof Operation)) continue;
      if (user.parentBlock !== block) return true;
      const userIdx = ops.indexOf(user);
      if (userIdx > lastUseIdx) lastUseIdx = userIdx;
    }
    const terminal = block.terminal;
    if (terminal !== undefined) {
      for (const p of terminal.getOperands()) {
        if (p.identifier === resultId) {
          lastUseIdx = ops.length;
          break;
        }
      }
    }
    if (lastUseIdx <= defIdx) return false;

    for (let j = defIdx + 1; j < lastUseIdx; j++) {
      const mid = ops[j];
      if (
        (mid instanceof StoreLocalOp || mid instanceof StoreContextOp) &&
        mid.kind === "assignment" &&
        mid.lval.identifier.declarationId === srcDecl
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Insert
   *     DeclareLocal const $snap
   *     StoreLocal(declaration) $snap = <source>
   * immediately before `load`, and replace `load` with a fresh LoadLocal
   * that reads from `$snap` and keeps the same result place. Returns the
   * number of ops inserted before `load`'s new position so the caller
   * can adjust its walking index.
   */
  #materializeLoadSnapshot(block: BasicBlock, load: LoadLocalOp, defIdx: number): number {
    const env = this.moduleIR.environment;

    const snapIdentifier = env.createIdentifier();
    const snapPlace = env.createPlace(snapIdentifier);

    const declareOp = new DeclareLocalOp(
      makeOperationId(env.nextOperationId++),
      snapPlace,
      "const",
    );

    const storeResultPlace = env.createPlace(env.createIdentifier());
    const storeOp = new StoreLocalOp(
      makeOperationId(env.nextOperationId++),
      storeResultPlace,
      snapPlace,
      load.value,
      "const",
      "declaration",
    );

    block.insertOpAt(defIdx, declareOp);
    block.insertOpAt(defIdx + 1, storeOp);
    env.placeToOp.set(storeResultPlace.id, storeOp);

    const newLoad = new LoadLocalOp(
      makeOperationId(env.nextOperationId++),
      load.place,
      snapPlace,
    );
    block.replaceOp(load, newLoad);
    env.placeToOp.set(load.place.id, newLoad);

    return 2;
  }
}
