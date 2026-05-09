import { describe, expect, it } from "vitest";
import { AnalysisManager } from "../analysis";
import { BasicBlock, makeBlockId } from "../core/Block";
import { FunctionIR, makeFunctionId } from "../core/FunctionIR";
import { IRIdAllocator } from "../core/IRIdAllocator";
import { blockTarget } from "../core/TerminatorOp";
import { Value } from "../core/Value";
import { ConstantOp } from "../ops/constants/ConstantOp";
import { BranchTerminatorOp } from "../ops/control/BranchTerminatorOp";
import { JumpTerminatorOp } from "../ops/control/JumpTerminatorOp";
import { ReturnTerminatorOp } from "../ops/control/ReturnTerminatorOp";
import { LoadGlobalOp } from "../ops/globals/LoadGlobalOp";
import { BinaryOp } from "../ops/operators/BinaryOp";
import { CallOp } from "../ops/calls/CallOp";
import { PureOperationEffects } from "../effects";
import {
  constantFact,
  intrinsicFact,
  type SemanticFactsProvider,
} from "../../semantics/SemanticFacts";
import { createConstantPropagationPass } from "./ConstantPropagationPass";

describe("ConstantPropagationPass", () => {
  it("folds pure operations with constant operands", () => {
    const ids = new IRIdAllocator();
    const entry = block(1);
    const left = value(ids);
    const right = value(ids);
    const sum = value(ids);

    entry.appendOp(new ConstantOp(ids.operationId(), 1, left));
    entry.appendOp(new ConstantOp(ids.operationId(), 2, right));
    entry.appendOp(new BinaryOp(ids.operationId(), "+", left, right, sum));
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), sum));

    createConstantPropagationPass({ ids }).run(functionIR(entry), new AnalysisManager());

    const folded = entry.operations[2];
    expect(folded).toBeInstanceOf(ConstantOp);
    expect((folded as ConstantOp).value).toBe(3);
  });

  it("merges block params only from executable edges", () => {
    const ids = new IRIdAllocator();
    const entry = block(1);
    const thenBlock = block(2);
    const elseBlock = block(3);
    const join = block(4);
    const condition = value(ids);
    const trueValue = value(ids);
    const falseValue = value(ids);
    const param = value(ids);

    join.appendParam(param);

    entry.appendOp(new ConstantOp(ids.operationId(), true, condition));
    entry.appendOp(new ConstantOp(ids.operationId(), 1, trueValue));
    entry.appendOp(new ConstantOp(ids.operationId(), 2, falseValue));
    entry.setTerminator(
      new BranchTerminatorOp(
        ids.operationId(),
        condition,
        blockTarget(thenBlock),
        blockTarget(elseBlock),
      ),
    );

    thenBlock.setTerminator(
      new JumpTerminatorOp(ids.operationId(), blockTarget(join, [trueValue])),
    );
    elseBlock.setTerminator(
      new JumpTerminatorOp(ids.operationId(), blockTarget(join, [falseValue])),
    );
    join.setTerminator(new ReturnTerminatorOp(ids.operationId(), param));

    createConstantPropagationPass({ ids }).run(
      functionIR(entry, thenBlock, elseBlock, join),
      new AnalysisManager(),
    );

    expect(entry.terminator).toBeInstanceOf(JumpTerminatorOp);
    expect((entry.terminator as JumpTerminatorOp).targetBlock).toBe(thenBlock);

    const materialized = join.operations[0];
    expect(materialized).toBeInstanceOf(ConstantOp);
    expect((materialized as ConstantOp).value).toBe(1);
    expect((join.terminator as ReturnTerminatorOp).value).toBe((materialized as ConstantOp).result);
  });

  it("uses semantic call effects before replacing calls", () => {
    const ids = new IRIdAllocator();
    const entry = block(1);
    const callee = value(ids);
    const arg = value(ids);
    const result = value(ids);
    const semantics: SemanticFactsProvider = {
      resolveGlobal(name) {
        return name === "known" ? intrinsicFact("known", "function") : undefined;
      },
      evaluateCall(target, args) {
        if (
          target.kind === "intrinsic" &&
          target.name === "known" &&
          args[0]?.kind === "constant" &&
          args[0].value === 2
        ) {
          return {
            result: constantFact(3),
            effects: PureOperationEffects,
          };
        }

        return undefined;
      },
    };

    entry.appendOp(new LoadGlobalOp(ids.operationId(), "known", callee));
    entry.appendOp(new ConstantOp(ids.operationId(), 2, arg));
    entry.appendOp(
      new CallOp(
        ids.operationId(),
        { kind: "value", callee },
        [{ kind: "value", value: arg }],
        result,
      ),
    );
    entry.setTerminator(new ReturnTerminatorOp(ids.operationId(), result));

    createConstantPropagationPass({ ids, semantics }).run(functionIR(entry), new AnalysisManager());

    const folded = entry.operations[2];
    expect(folded).toBeInstanceOf(ConstantOp);
    expect((folded as ConstantOp).value).toBe(3);
  });
});

function block(id: number): BasicBlock {
  return new BasicBlock(makeBlockId(id));
}

function functionIR(entry: BasicBlock, ...blocks: BasicBlock[]): FunctionIR {
  return new FunctionIR(makeFunctionId(1), {
    params: [],
    blocks: [entry, ...blocks],
  });
}

function value(ids: IRIdAllocator): Value {
  return new Value(ids.valueId());
}
