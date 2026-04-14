import { LiteralOp, makeOperationId, StoreLocalOp, type BlockId } from "../../ir";
import { BasicBlock } from "../../ir/core/Block";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { forEachOutgoingEdge } from "./blockArgs";

/**
 * Out-of-SSA lowering.
 *
 * Consumes `block.params` (the merged value) and the per-edge arg
 * lists on each predecessor's `JumpOp.args`. Under the textbook
 * MLIR model `JumpOp` is the only edge-carrying terminator — every
 * other terminator (Return, Throw, Break, Continue, Yield) has
 * zero edge args. For each block parameter the eliminator declares
 * the backing `let` at the function entry and inserts `param = arg`
 * stores at the end of every predecessor block.
 *
 * Uses Sreedhar Method I: placing stores before the predecessor's
 * terminator works without splitting critical edges because along
 * any path the *last* store wins.
 */
export class SSAEliminator {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): void {
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
}
