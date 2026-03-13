import {
  BaseInstruction,
  BlockId,
  DeclarationId,
  Identifier,
  LoadLocalInstruction,
  LoadPhiInstruction,
  Place,
  ReturnTerminal,
  StoreLocalInstruction,
  ThrowTerminal,
} from "../../ir";
import { BaseTerminal } from "../../ir/base/Terminal";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Phi } from "./Phi";
import { createPhiIdentifier } from "./utils";

export interface SSA {
  phis: Set<Phi>;
}

/**
 * Computes the phis for the HIR.
 */
export class SSABuilder {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public build(): SSA {
    const phis = this.computePhiNodes();
    this.renameVariables(phis);
    return { phis };
  }

  /**
   * Gathers all the φ-nodes needed for every variable that has multiple definitions
   * in different blocks.
   */
  private computePhiNodes(): Set<Phi> {
    const phis = new Set<Phi>();
    const functionBlockIds = new Set(this.functionIR.blocks.keys());

    for (const [declarationId, placeIds] of this.moduleIR.environment.declToPlaces) {
      // Only consider definitions in blocks belonging to this function,
      // since declToPlaces is shared across all functions in the module.
      const definitionBlocks = placeIds
        .filter((p) => functionBlockIds.has(p.blockId))
        .map((p) => p.blockId);
      if (definitionBlocks.length <= 1) {
        continue;
      }

      this.insertPhiNodesForDeclaration(declarationId, definitionBlocks, phis);
    }

    return phis;
  }

  /**
   * For a single declaration, inserts φ-nodes into the dominance frontier of
   * all definition blocks. Uses a standard "workList + dominanceFrontier" approach.
   */
  private insertPhiNodesForDeclaration(
    declarationId: DeclarationId,
    definitionBlocks: BlockId[],
    phis: Set<Phi>,
  ): void {
    const workList = [...definitionBlocks];
    const hasPhi = new Set<BlockId>();
    const defBlocks = new Set(definitionBlocks);

    while (workList.length > 0) {
      const definitionBlock = workList.pop()!;
      const frontier = this.functionIR.dominanceFrontier.get(definitionBlock);
      if (frontier === undefined) {
        continue;
      }

      for (const blockId of frontier) {
        if (hasPhi.has(blockId)) {
          continue;
        }

        // Insert new φ-node
        const identifier = createPhiIdentifier(this.moduleIR.environment);
        const place = this.moduleIR.environment.createPlace(identifier);
        phis.add(new Phi(blockId, place, new Map(), declarationId));
        hasPhi.add(blockId);

        // If blockId wasn't already in the definition set, add it to the workList
        if (!defBlocks.has(blockId)) {
          defBlocks.add(blockId);
          workList.push(blockId);
        }
      }
    }
  }

  /**
   * Perform classic SSA renaming using dominator-tree DFS (Cytron et al.).
   * Populates φ-node operands and rewrites references in a single pass.
   */
  private renameVariables(phis: Set<Phi>): void {
    const stacks = new Map<DeclarationId, Place[]>();
    const domChildren = this.buildDominatorChildren();

    // Index phis by block for O(1) lookup instead of scanning all phis per block
    const phisByBlock = new Map<BlockId, Phi[]>();
    const phiDecls = new Set<DeclarationId>();
    for (const phi of phis) {
      phiDecls.add(phi.declarationId);
      if (!phisByBlock.has(phi.blockId)) phisByBlock.set(phi.blockId, []);
      phisByBlock.get(phi.blockId)!.push(phi);
    }

    const rename = (blockId: BlockId) => {
      const block = this.functionIR.blocks.get(blockId)!;
      const pushed: DeclarationId[] = [];

      // 1. Push φ results
      for (const phi of phisByBlock.get(blockId) ?? []) {
        const decl = phi.declarationId;
        if (!stacks.has(decl)) stacks.set(decl, []);

        stacks.get(decl)!.push(phi.place);
        pushed.push(decl);
      }

      // 2. Rewrite instruction uses and push new definitions
      for (let i = 0; i < block.instructions.length; i++) {
        const instruction = block.instructions[i];

        // Build a rewrite map for phi'd variables referenced by this instruction
        const rewriteMap = new Map<Identifier, Place>();
        const reads = instruction.getReadPlaces?.() ?? [];
        for (const place of reads) {
          const decl = place.identifier.declarationId;
          if (!phiDecls.has(decl)) continue;
          const stack = stacks.get(decl);
          if (stack && stack.length > 0) {
            rewriteMap.set(place.identifier, stack[stack.length - 1]);
          }
        }

        if (rewriteMap.size > 0) {
          block.instructions[i] = this.rewriteInstruction(instruction, rewriteMap);
        }

        // Push new definitions for StoreLocal of phi'd variables
        if (instruction instanceof StoreLocalInstruction) {
          const decl = instruction.lval.identifier.declarationId;
          if (phiDecls.has(decl)) {
            if (!stacks.has(decl)) stacks.set(decl, []);
            stacks.get(decl)!.push(instruction.lval);
            pushed.push(decl);
          }
        }
      }

      // 3. Rewrite terminal uses
      if (block.terminal !== undefined) {
        const reads = block.terminal.getReadPlaces?.() ?? [];
        const rewriteMap = new Map<Identifier, Place>();
        for (const place of reads) {
          const decl = place.identifier.declarationId;
          if (!phiDecls.has(decl)) continue;
          const stack = stacks.get(decl);
          if (stack && stack.length > 0) {
            rewriteMap.set(place.identifier, stack[stack.length - 1]);
          }
        }
        if (rewriteMap.size > 0) {
          block.terminal = this.rewriteTerminal(block.terminal, rewriteMap);
        }
      }

      // 4. Fill successor φ operands
      const successors = this.functionIR.successors.get(blockId) ?? [];
      for (const succ of successors) {
        for (const phi of phisByBlock.get(succ) ?? []) {
          const stack = stacks.get(phi.declarationId);
          if (stack && stack.length > 0) {
            phi.operands.set(blockId, stack[stack.length - 1]);
          }
        }
      }

      // 5. Recurse dominator children
      for (const child of domChildren.get(blockId) ?? []) {
        rename(child);
      }

      // 6. Pop definitions
      for (const decl of pushed.reverse()) {
        stacks.get(decl)!.pop();
      }
    };

    rename(this.functionIR.entryBlockId);
  }

  private rewriteTerminal(terminal: BaseTerminal, values: Map<Identifier, Place>): BaseTerminal {
    if (terminal instanceof ReturnTerminal && values.has(terminal.value.identifier)) {
      return new ReturnTerminal(terminal.id, values.get(terminal.value.identifier)!);
    }

    if (terminal instanceof ThrowTerminal && values.has(terminal.value.identifier)) {
      return new ThrowTerminal(terminal.id, values.get(terminal.value.identifier)!);
    }

    return terminal;
  }

  private rewriteInstruction<T extends BaseInstruction>(
    instruction: T,
    values: Map<Identifier, Place>,
  ): T | LoadPhiInstruction {
    if (instruction instanceof LoadLocalInstruction && values.has(instruction.value.identifier)) {
      return new LoadPhiInstruction(
        instruction.id,
        instruction.place,
        instruction.nodePath,
        values.get(instruction.value.identifier)!,
      );
    }

    return instruction.rewrite(values) as T;
  }

  /**
   * Build dominator tree children map from immediate dominators.
   */
  private buildDominatorChildren(): Map<BlockId, BlockId[]> {
    const children = new Map<BlockId, BlockId[]>();

    for (const [blockId, idom] of this.functionIR.immediateDominators) {
      if (idom === undefined) continue;

      if (!children.has(idom)) children.set(idom, []);
      children.get(idom)!.push(blockId);
    }

    return children;
  }
}
