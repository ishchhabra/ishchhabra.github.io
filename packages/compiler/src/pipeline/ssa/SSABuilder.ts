import {
  BaseInstruction,
  BlockId,
  DeclarationId,
  Identifier,
  LoadLocalInstruction,
  LoadPhiInstruction,
  Place,
  StoreLocalInstruction,
} from "../../ir";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Phi } from "./Phi";
import { createPhiIdentifier } from "./utils";

export interface SSA {
  phis: Set<Phi>;
}

/**
 * Builds SSA form for a single function using Cytron et al.'s algorithm:
 *
 *   1. **Phi placement** — for each variable with multiple definitions,
 *      insert φ-nodes at the iterated dominance frontier.
 *   2. **Renaming** — DFS over the dominator tree, rewriting uses to the
 *      current reaching definition and populating φ-operands.
 *
 * Header instructions (parameter bindings) live outside the CFG. Before
 * the rename DFS starts, their definitions are seeded onto the rename
 * stacks so that φ-operands on paths that don't reassign a parameter
 * include the header-defined value.
 */
export class SSABuilder {
  constructor(
    private readonly functionIR: FunctionIR,
    private readonly moduleIR: ModuleIR,
  ) {}

  public build(): SSA {
    const phis = this.placePhi();
    this.rename(phis);
    return { phis };
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Phi placement
  // ---------------------------------------------------------------------------

  /**
   * For every variable with definitions in multiple blocks, insert φ-nodes
   * at the iterated dominance frontier of those definition blocks.
   */
  private placePhi(): Set<Phi> {
    const phis = new Set<Phi>();
    const ownBlockIds = new Set(this.functionIR.blocks.keys());

    for (const [declId, entries] of this.moduleIR.environment.declToPlaces) {
      if (this.moduleIR.environment.contextDeclarationIds.has(declId)) continue;

      const defBlocks = entries
        .filter((e) => ownBlockIds.has(e.blockId))
        .map((e) => e.blockId);
      if (defBlocks.length <= 1) continue;

      this.placePhiForDeclaration(declId, defBlocks, phis);
    }
    return phis;
  }

  /**
   * Standard worklist algorithm: for a single declaration, insert φ-nodes
   * at the dominance frontier of all definition blocks.
   */
  private placePhiForDeclaration(
    declId: DeclarationId,
    defBlocks: BlockId[],
    phis: Set<Phi>,
  ): void {
    const worklist = [...defBlocks];
    const hasPhi = new Set<BlockId>();
    const defSet = new Set(defBlocks);

    while (worklist.length > 0) {
      const block = worklist.pop()!;
      for (const frontier of this.functionIR.dominanceFrontier.get(block) ?? []) {
        if (hasPhi.has(frontier)) continue;

        const id = createPhiIdentifier(this.moduleIR.environment);
        const place = this.moduleIR.environment.createPlace(id);
        phis.add(new Phi(frontier, place, new Map(), declId));
        hasPhi.add(frontier);

        if (!defSet.has(frontier)) {
          defSet.add(frontier);
          worklist.push(frontier);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Renaming
  // ---------------------------------------------------------------------------

  /**
   * DFS over the dominator tree. For each block: push φ-results, rewrite
   * instruction/structure/terminal uses, push new definitions, fill
   * successor φ-operands, recurse children, then pop.
   */
  private rename(phis: Set<Phi>): void {
    const stacks = new Map<DeclarationId, Place[]>();
    const domChildren = this.buildDominatorChildren();
    const { phisByBlock, phiDecls } = this.indexPhis(phis);

    // Seed stacks with header definitions (parameter bindings). Header
    // instructions live outside any block — the rename DFS won't encounter
    // them. Seeding ensures φ-operands on skip paths include the
    // parameter's value rather than being empty.
    this.seedHeaderDefinitions(stacks, phiDecls);

    const visit = (blockId: BlockId) => {
      const block = this.functionIR.blocks.get(blockId)!;
      const pushed: DeclarationId[] = [];

      this.pushPhiResults(blockId, phisByBlock, stacks, pushed);
      this.rewriteAndPushInstructions(block, phiDecls, stacks, pushed);
      this.rewriteAndPushStructure(blockId, phiDecls, stacks, pushed);
      this.rewriteTerminal(block, phiDecls, stacks);
      this.fillSuccessorPhiOperands(blockId, phisByBlock, stacks);

      for (const child of domChildren.get(blockId) ?? []) {
        visit(child);
      }

      for (const decl of pushed.reverse()) {
        stacks.get(decl)!.pop();
      }
    };

    visit(this.functionIR.entryBlockId);
  }

  // ---------------------------------------------------------------------------
  // Rename helpers
  // ---------------------------------------------------------------------------

  private indexPhis(phis: Set<Phi>): {
    phisByBlock: Map<BlockId, Phi[]>;
    phiDecls: Set<DeclarationId>;
  } {
    const phisByBlock = new Map<BlockId, Phi[]>();
    const phiDecls = new Set<DeclarationId>();
    for (const phi of phis) {
      phiDecls.add(phi.declarationId);
      if (!phisByBlock.has(phi.blockId)) phisByBlock.set(phi.blockId, []);
      phisByBlock.get(phi.blockId)!.push(phi);
    }
    return { phisByBlock, phiDecls };
  }

  /**
   * Seed stacks from the function header. Both BindingIdentifier
   * (simple params) and StoreLocal (destructuring patterns) in the
   * header define places that SSA must track.
   */
  private seedHeaderDefinitions(
    stacks: Map<DeclarationId, Place[]>,
    phiDecls: Set<DeclarationId>,
  ): void {
    for (const instr of this.functionIR.header) {
      if (instr instanceof StoreLocalInstruction) {
        for (const place of instr.getWrittenPlaces()) {
          this.pushIfPhi(place, phiDecls, stacks);
        }
      } else {
        this.pushIfPhi(instr.place, phiDecls, stacks);
      }
    }
  }

  private pushIfPhi(
    place: Place,
    phiDecls: Set<DeclarationId>,
    stacks: Map<DeclarationId, Place[]>,
    pushed?: DeclarationId[],
  ): void {
    const decl = place.identifier.declarationId;
    if (!phiDecls.has(decl)) return;
    if (!stacks.has(decl)) stacks.set(decl, []);
    stacks.get(decl)!.push(place);
    pushed?.push(decl);
  }

  private pushPhiResults(
    blockId: BlockId,
    phisByBlock: Map<BlockId, Phi[]>,
    stacks: Map<DeclarationId, Place[]>,
    pushed: DeclarationId[],
  ): void {
    for (const phi of phisByBlock.get(blockId) ?? []) {
      const decl = phi.declarationId;
      if (!stacks.has(decl)) stacks.set(decl, []);
      stacks.get(decl)!.push(phi.place);
      pushed.push(decl);
    }
  }

  private rewriteAndPushInstructions(
    block: { instructions: BaseInstruction[] },
    phiDecls: Set<DeclarationId>,
    stacks: Map<DeclarationId, Place[]>,
    pushed: DeclarationId[],
  ): void {
    for (let i = 0; i < block.instructions.length; i++) {
      const instruction = block.instructions[i];

      const rewriteMap = this.buildRewriteMap(
        instruction.getReadPlaces?.() ?? [],
        phiDecls,
        stacks,
      );
      if (rewriteMap.size > 0) {
        const rewritten = this.rewriteInstruction(instruction, rewriteMap);
        block.instructions[i] = rewritten;
        this.moduleIR.environment.placeToInstruction.set(rewritten.place.id, rewritten);
      }

      if (instruction instanceof StoreLocalInstruction) {
        for (const place of instruction.getWrittenPlaces()) {
          this.pushIfPhi(place, phiDecls, stacks, pushed);
        }
      }
    }
  }

  private rewriteAndPushStructure(
    blockId: BlockId,
    phiDecls: Set<DeclarationId>,
    stacks: Map<DeclarationId, Place[]>,
    pushed: DeclarationId[],
  ): void {
    const structure = this.functionIR.structures.get(blockId);
    if (!structure) return;

    const rewriteMap = this.buildRewriteMap(
      structure.getReadPlaces(),
      phiDecls,
      stacks,
    );
    if (rewriteMap.size > 0) {
      this.functionIR.structures.set(blockId, structure.rewrite(rewriteMap));
    }

    for (const place of structure.getWrittenPlaces()) {
      this.pushIfPhi(place, phiDecls, stacks, pushed);
    }
  }

  private rewriteTerminal(
    block: { terminal?: { getReadPlaces?(): Place[]; rewrite(v: Map<Identifier, Place>): any } },
    phiDecls: Set<DeclarationId>,
    stacks: Map<DeclarationId, Place[]>,
  ): void {
    if (!block.terminal) return;

    const rewriteMap = this.buildRewriteMap(
      block.terminal.getReadPlaces?.() ?? [],
      phiDecls,
      stacks,
    );
    if (rewriteMap.size > 0) {
      block.terminal = block.terminal.rewrite(rewriteMap);
    }
  }

  private fillSuccessorPhiOperands(
    blockId: BlockId,
    phisByBlock: Map<BlockId, Phi[]>,
    stacks: Map<DeclarationId, Place[]>,
  ): void {
    for (const succ of this.functionIR.successors.get(blockId) ?? []) {
      for (const phi of phisByBlock.get(succ) ?? []) {
        const stack = stacks.get(phi.declarationId);
        if (stack && stack.length > 0) {
          phi.operands.set(blockId, stack[stack.length - 1]);
        }
      }
    }
  }

  private buildRewriteMap(
    reads: Place[],
    phiDecls: Set<DeclarationId>,
    stacks: Map<DeclarationId, Place[]>,
  ): Map<Identifier, Place> {
    const map = new Map<Identifier, Place>();
    for (const place of reads) {
      const decl = place.identifier.declarationId;
      if (!phiDecls.has(decl)) continue;
      const stack = stacks.get(decl);
      if (stack && stack.length > 0) {
        map.set(place.identifier, stack[stack.length - 1]);
      }
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

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
