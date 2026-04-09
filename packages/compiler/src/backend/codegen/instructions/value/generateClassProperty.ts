import * as t from "@babel/types";
import { ClassPropertyInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateFunction } from "../../generateFunction";

/**
 * Emits a {@link t.ClassProperty} for a class field instruction.
 *
 * The initializer is stored in the IR as a zero-arg {@link FunctionIR}
 * "thunk" (see {@link ClassPropertyInstruction}). We generate its body
 * via the normal {@link generateFunction} pipeline and then extract the
 * single `return <expr>;` statement — the extracted expression becomes
 * the class property's value. Planting it as a literal AST expression
 * ensures the JS runtime evaluates it per-instance with correct `this`
 * binding and `[[DefineOwnProperty]]` semantics.
 */
export function generateClassPropertyInstruction(
  instruction: ClassPropertyInstruction,
  generator: CodeGenerator,
): t.ClassProperty {
  const key = generator.places.get(instruction.key.id);
  if (key === undefined) {
    throw new Error(`Place ${instruction.key.id} not found`);
  }
  t.assertExpression(key);

  let value: t.Expression | null = null;
  if (instruction.value !== null) {
    const { statements } = generateFunction(instruction.value, instruction.captures, generator);
    value = extractInitializerExpression(statements);
  }

  const node = t.classProperty(
    key,
    value,
    null, // typeAnnotation
    null, // decorators
    instruction.computed,
    instruction.isStatic,
  );
  generator.places.set(instruction.place.id, node);
  return node;
}

/**
 * Extracts the initializer expression from a thunk's generated body.
 *
 * The thunk was built from a single expression, so its body is always a
 * single `return <expr>;` statement. Anything else means we accidentally
 * emitted extra statements during code generation — that's a bug,
 * because a class field initializer must be a single expression in the
 * emitted AST.
 */
function extractInitializerExpression(statements: t.Statement[]): t.Expression {
  if (statements.length !== 1 || !t.isReturnStatement(statements[0])) {
    throw new Error(
      `Class field initializer thunk did not lower to a single return statement ` +
        `(got ${statements.length} statement(s): ${statements.map((s) => s.type).join(", ")})`,
    );
  }
  const arg = statements[0].argument;
  if (arg == null) {
    throw new Error("Class field initializer thunk returned no value");
  }
  return arg;
}
