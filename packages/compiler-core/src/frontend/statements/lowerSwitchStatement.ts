import type { SwitchStatement } from "oxc-parser";

import { blockTarget } from "../../ir/core/TerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { SwitchCaseTarget, SwitchTerminatorOp } from "../../ir/ops/control/SwitchTerminatorOp";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { StatementLoweringOptions } from "./loweringOptions";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers `switch` to explicit case blocks with ordinary fallthrough jumps.
 */
export function lowerSwitchStatement(
  builder: FunctionIRBuilder,
  statement: SwitchStatement,
  options: StatementLoweringOptions = {},
): void {
  const discriminant = lowerExpression(builder, statement.discriminant);
  lowerDeclarationInstantiation(builder, statement);

  const caseBlocks = statement.cases.map(() => builder.createBlock());
  const completionBlock = builder.createBlock();

  const cases: SwitchCaseTarget[] = statement.cases.map((switchCase, index) => ({
    test: switchCase.test === null ? null : lowerExpression(builder, switchCase.test),
    target: blockTarget(caseBlocks[index]),
    synthetic: false,
  }));

  if (!cases.some((switchCase) => switchCase.test === null)) {
    cases.push({
      test: null,
      target: blockTarget(completionBlock),
      synthetic: true,
    });
  }

  const control = {
    kind: "label" as const,
    label: options.label ?? null,
    breakTarget: completionBlock,
  };

  builder.terminate(
    new SwitchTerminatorOp(
      builder.operationId(),
      discriminant,
      cases,
      completionBlock,
      options.label ?? null,
    ),
  );

  builder.pushControl(control);
  try {
    for (let i = 0; i < statement.cases.length; i++) {
      builder.setCurrentBlock(caseBlocks[i]);

      for (const consequent of statement.cases[i].consequent) {
        lowerStatement(builder, consequent);
      }

      if (!builder.currentBlock.isTerminated) {
        const nextBlock = i + 1 < caseBlocks.length ? caseBlocks[i + 1] : completionBlock;

        builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(nextBlock)));
      }
    }
  } finally {
    builder.popControl(control);
  }

  builder.setCurrentBlock(completionBlock);
}
