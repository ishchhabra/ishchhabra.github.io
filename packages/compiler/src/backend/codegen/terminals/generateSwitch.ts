import * as t from "@babel/types";
import { SwitchTerminal } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlock } from "../generateBlock";

export function generateSwitchTerminal(
  terminal: SwitchTerminal,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  // Reserve the fallthrough block.
  generator.generatedBlocks.add(terminal.fallthrough);

  // Resolve the discriminant.
  const discriminantNode = generator.places.get(terminal.discriminant.id);
  if (discriminantNode === undefined) {
    throw new Error(`Place ${terminal.discriminant.id} not found for switch discriminant`);
  }
  t.assertExpression(discriminantNode);

  // Push switch onto control stack so JumpTerminals to fallthrough emit `break`.
  generator.controlStack.push({ kind: "switch", breakTarget: terminal.fallthrough });

  // Reserve all case blocks to prevent cross-pulling.
  for (const c of terminal.cases) {
    generator.generatedBlocks.add(c.block);
  }

  // Generate each case.
  const switchCases: t.SwitchCase[] = [];
  for (const c of terminal.cases) {
    let testNode: t.Expression | null = null;
    if (c.test !== null) {
      const node = generator.places.get(c.test.id);
      if (node === undefined) {
        throw new Error(`Place ${c.test.id} not found for switch case test`);
      }
      t.assertExpression(node);
      testNode = node;
    }

    // Skip the synthesized default case that points directly to fallthrough.
    if (c.test === null && c.block === terminal.fallthrough) {
      continue;
    }

    generator.generatedBlocks.delete(c.block);
    const caseStatements = generateBlock(c.block, functionIR, generator);
    switchCases.push(t.switchCase(testNode, caseStatements));
  }

  // Pop control stack and generate the fallthrough block.
  generator.controlStack.pop();
  generator.generatedBlocks.delete(terminal.fallthrough);
  const fallthroughStatements = generateBlock(terminal.fallthrough, functionIR, generator);

  const switchStatement = t.switchStatement(discriminantNode, switchCases);
  return [switchStatement, ...fallthroughStatements];
}
