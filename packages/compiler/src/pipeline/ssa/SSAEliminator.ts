import {
  BasicBlock,
  BindingIdentifierInstruction,
  BlockId,
  CopyInstruction,
  ExpressionStatementInstruction,
  LiteralInstruction,
  LoadLocalInstruction,
  makeInstructionId,
  StoreLocalInstruction,
} from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Place } from "../../ir/core/Place";
import { Phi } from "./Phi";

interface SSAEliminationResult {
  blocks: Map<BlockId, BasicBlock>;
}

/**
 * Boissinot-style SSA elimination (isolation phase).
 *
 * Converts phi nodes into explicit copy instructions using parallel-copy
 * semantics. For each CFG edge that carries phi operands:
 *
 *   1. Collects the set of parallel copies: { phi.place ← operand }
 *   2. Sequentializes them, breaking cycles with temporary variables.
 *
 * At SSA elimination time, phi destinations have unique identifiers
 * distinct from the SSA operand sources, so cycles between phi copies
 * themselves don't occur. However, the sequentialization algorithm is
 * implemented for correctness in all cases.
 *
 * The late optimizer (copy propagation + coalescing + DCE) handles
 * cleanup of redundant copies. The coalescing pass's interference
 * check (`isSafeToCoalesce`) prevents removal of intermediates that
 * are needed to preserve values across parallel copy boundaries.
 *
 * Phi declarations (`let phi_var = undefined`) are emitted in the block
 * where the original variable was declared, ensuring correct JavaScript
 * scoping.
 */
export class SSAEliminator {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public eliminate(): SSAEliminationResult {
    // Step 1: Collect parallel copies per predecessor block.
    const edgeCopies = new Map<BlockId, { dst: Place; src: Place }[]>();

    for (const phi of this.functionIR.phis) {
      if (phi.operands.size === 0) {
        continue;
      }

      this.#insertPhiDeclaration(phi);

      for (const [predBlockId, operandPlace] of phi.operands) {
        let copies = edgeCopies.get(predBlockId);
        if (copies === undefined) {
          copies = [];
          edgeCopies.set(predBlockId, copies);
        }
        copies.push({ dst: phi.place, src: operandPlace });
      }
    }

    // Step 2: Sequentialize and emit copies for each edge.
    for (const [predBlockId, copies] of edgeCopies) {
      this.#emitSequentializedCopies(predBlockId, copies);
    }

    return { blocks: this.functionIR.blocks };
  }

  /**
   * Emit a `let phi_var = undefined` declaration in the block where the
   * original variable was declared.
   */
  #insertPhiDeclaration(phi: Phi) {
    const declaration = this.moduleIR.environment.declToPlaces.get(phi.declarationId)?.[0];
    if (declaration === undefined) {
      throw new Error(`Declaration place not found for ${phi.declarationId}`);
    }

    const declarationBlock = this.functionIR.getBlock(declaration.blockId);

    const bindingInstr = this.moduleIR.environment.createInstruction(
      BindingIdentifierInstruction,
      phi.place,
      undefined,
    );
    declarationBlock.appendInstruction(bindingInstr);
    this.moduleIR.environment.placeToInstruction.set(phi.place.id, bindingInstr);

    const undefinedId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const undefinedPlace = this.moduleIR.environment.createPlace(
      this.moduleIR.environment.createIdentifier(),
    );
    const undefinedInstr = new LiteralInstruction(
      undefinedId,
      undefinedPlace,
      undefined,
      undefined,
    );
    declarationBlock.appendInstruction(undefinedInstr);
    this.moduleIR.environment.placeToInstruction.set(undefinedPlace.id, undefinedInstr);

    const identifier = this.moduleIR.environment.createIdentifier(
      phi.place.identifier.declarationId,
    );
    const place = this.moduleIR.environment.createPlace(identifier);

    const instructionId = makeInstructionId(this.moduleIR.environment.nextInstructionId++);
    const instruction = new StoreLocalInstruction(
      instructionId,
      place,
      undefined,
      phi.place,
      undefinedPlace,
      "let",
    );

    declarationBlock.appendInstruction(instruction);
    this.moduleIR.environment.placeToInstruction.set(place.id, instruction);
  }

  /**
   * Boissinot's parallel copy sequentialization.
   *
   * Given a set of parallel copies {d_i ← s_i}, emit sequential
   * instructions that produce the same result. The algorithm:
   *
   *   1. Find a "ready" copy — one whose destination is NOT used as a
   *      source by any other copy. Emit it directly (LoadLocal + Copy).
   *   2. If no ready copy exists, all remaining copies form cycles.
   *      Break one cycle by introducing a temporary (StoreLocal),
   *      then continue.
   *
   * Identity copies (src.id === dst.id) are skipped.
   */
  #emitSequentializedCopies(
    predBlockId: BlockId,
    parallelCopies: { dst: Place; src: Place }[],
  ) {
    const block = this.functionIR.getBlock(predBlockId);

    // Filter identity copies.
    const copies = parallelCopies.filter(
      (c) => c.src.identifier.id !== c.dst.identifier.id,
    );

    if (copies.length === 0) return;

    // Track which copies are still pending.
    const pending = new Set(copies.map((_, i) => i));

    // Map from identifier id → index, for copies whose dst is used as src.
    const dstIds = new Map<number, number>();
    for (const [i, c] of copies.entries()) {
      dstIds.set(c.dst.identifier.id, i);
    }

    while (pending.size > 0) {
      // Find a ready copy: dst is not used as src by any pending copy.
      let readyIdx: number | undefined;
      for (const i of pending) {
        const dst = copies[i].dst;
        let isBlocked = false;
        for (const j of pending) {
          if (i !== j && copies[j].src.identifier.id === dst.identifier.id) {
            isBlocked = true;
            break;
          }
        }
        if (!isBlocked) {
          readyIdx = i;
          break;
        }
      }

      if (readyIdx !== undefined) {
        // Emit the ready copy: LoadLocal + Copy + ExpressionStatement.
        const { dst, src } = copies[readyIdx];
        this.#emitCopy(block, dst, src);
        pending.delete(readyIdx);
      } else {
        // All pending copies form cycles. Break one with a temporary.
        const cycleIdx = pending.values().next().value!;
        const { src } = copies[cycleIdx];

        // Emit: const tmp = src
        const tmpLval = this.#emitTempCapture(block, src);

        // Replace src with tmp in the cycle copy.
        copies[cycleIdx] = { dst: copies[cycleIdx].dst, src: tmpLval };

        // The cycle copy's dst may now be ready since we replaced its src.
      }
    }
  }

  /**
   * Emit a single copy: LoadLocal(src) → Copy(dst, loaded) → ExpressionStatement.
   */
  #emitCopy(block: BasicBlock, dst: Place, src: Place) {
    const env = this.moduleIR.environment;

    const loadId = makeInstructionId(env.nextInstructionId++);
    const loadPlace = env.createPlace(env.createIdentifier());
    const loadInstr = new LoadLocalInstruction(loadId, loadPlace, undefined, src);
    block.appendInstruction(loadInstr);
    env.placeToInstruction.set(loadPlace.id, loadInstr);

    const copyId = makeInstructionId(env.nextInstructionId++);
    const copyPlace = env.createPlace(
      env.createIdentifier(dst.identifier.declarationId),
    );
    const copyInstr = new CopyInstruction(copyId, copyPlace, undefined, dst, loadPlace);
    block.appendInstruction(copyInstr);
    env.placeToInstruction.set(copyPlace.id, copyInstr);

    const exprId = makeInstructionId(env.nextInstructionId++);
    const exprPlace = env.createPlace(env.createIdentifier());
    const exprInstr = new ExpressionStatementInstruction(exprId, exprPlace, undefined, copyPlace);
    block.appendInstruction(exprInstr);
    env.placeToInstruction.set(exprPlace.id, exprInstr);
  }

  /**
   * Emit a cycle-breaking temporary: LoadLocal(src) → const tmp = loaded.
   * Returns the tmp's lval place for use as a source in subsequent copies.
   */
  #emitTempCapture(block: BasicBlock, src: Place): Place {
    const env = this.moduleIR.environment;

    // Load the source value.
    const loadId = makeInstructionId(env.nextInstructionId++);
    const loadPlace = env.createPlace(env.createIdentifier());
    const loadInstr = new LoadLocalInstruction(loadId, loadPlace, undefined, src);
    block.appendInstruction(loadInstr);
    env.placeToInstruction.set(loadPlace.id, loadInstr);

    // Create const temporary.
    const tmpIdentifier = env.createIdentifier();
    const tmpLval = env.createPlace(tmpIdentifier);

    const bindingInstr = env.createInstruction(
      BindingIdentifierInstruction,
      tmpLval,
      undefined,
    );
    block.appendInstruction(bindingInstr);
    env.placeToInstruction.set(tmpLval.id, bindingInstr);

    const tmpDeclPlace = env.createPlace(env.createIdentifier());
    const storeId = makeInstructionId(env.nextInstructionId++);
    const storeInstr = new StoreLocalInstruction(
      storeId,
      tmpDeclPlace,
      undefined,
      tmpLval,
      loadPlace,
      "const",
    );
    block.appendInstruction(storeInstr);
    env.placeToInstruction.set(tmpDeclPlace.id, storeInstr);

    return tmpLval;
  }
}
