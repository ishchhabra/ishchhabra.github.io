import { describe, expect, it } from "vitest";
import { Environment } from "../../environment";
import { ProjectEnvironment } from "../../ProjectEnvironment";
import { BasicBlock, LiteralOp, ReturnTermOp, StoreLocalOp } from "../../ir";
import { FuncOp, makeFuncOpId } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { BranchTermOp, JumpTermOp } from "../../ir/ops/control";
import { SSAEliminator } from "./SSAEliminator";

function buildBranchEdgePhiFixture(): {
  entry: BasicBlock;
  join: BasicBlock;
  funcOp: FuncOp;
  moduleIR: ModuleIR;
} {
  const env = new Environment(new ProjectEnvironment());
  const moduleIR = new ModuleIR("m.js", env);
  const entry = env.createBlock();
  const join = env.createBlock();

  const cond = env.createValue();
  const trueValue = env.createValue();
  const falseValue = env.createValue();
  const phi = env.createValue();

  entry.appendOp(env.createOperation(LiteralOp, cond, true));
  entry.appendOp(env.createOperation(LiteralOp, trueValue, 1));
  entry.appendOp(env.createOperation(LiteralOp, falseValue, 2));
  entry.setTerminal(env.createOperation(BranchTermOp, cond, join, join, [trueValue], [falseValue]));

  phi.originalDeclarationId = trueValue.declarationId;
  join.params = [phi];
  join.setTerminal(env.createOperation(ReturnTermOp, phi));

  const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
    entry,
    join,
  ]);

  return { entry, join, funcOp, moduleIR };
}

describe("SSAEliminator", () => {
  it("splits BranchTermOp edges before inserting phi copy stores", () => {
    const { entry, join, funcOp, moduleIR } = buildBranchEdgePhiFixture();

    new SSAEliminator(funcOp, moduleIR).eliminate();

    const terminal = entry.terminal;
    expect(terminal).toBeInstanceOf(BranchTermOp);
    const branch = terminal as BranchTermOp;
    expect(branch.trueTarget).not.toBe(join);
    expect(branch.falseTarget).not.toBe(join);
    expect(branch.trueArgs).toHaveLength(0);
    expect(branch.falseArgs).toHaveLength(0);

    for (const split of [branch.trueTarget, branch.falseTarget]) {
      expect(split.operations.some((op) => op instanceof StoreLocalOp)).toBe(true);
      expect(split.terminal).toBeInstanceOf(JumpTermOp);
      expect((split.terminal as JumpTermOp).targetBlock).toBe(join);
    }

    const entryAssignmentCopies = entry.operations.filter((op) => {
      const valueDef = op instanceof StoreLocalOp ? op.value.def : undefined;
      return (
        op instanceof StoreLocalOp &&
        op.lval === join.params[0] &&
        valueDef instanceof LiteralOp &&
        valueDef.value !== undefined
      );
    });
    expect(entryAssignmentCopies).toHaveLength(0);
  });
});
