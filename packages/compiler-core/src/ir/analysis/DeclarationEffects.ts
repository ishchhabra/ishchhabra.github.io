import type { BindingPatternTarget } from "../core/DestructurePattern";
import type { Operation } from "../core/Operation";
import type { DeclarationId, Value } from "../core/Value";
import { InitializeBindingOp } from "../ops/bindings/InitializeBindingOp";
import { LoadBindingOp } from "../ops/bindings/LoadBindingOp";
import { StoreBindingOp } from "../ops/bindings/StoreBindingOp";
import { CreateFunctionOp } from "../ops/functions/CreateFunctionOp";
import { DeleteOp } from "../ops/operators/DeleteOp";
import { DestructureBindingOp } from "../ops/patterns/DestructureBindingOp";

export type DeclarationDefKind = "initialize";
export type DeclarationUseKind = "capture" | "delete" | "read" | "value-flow" | "write";

/**
 * Source declaration defined by an operation.
 *
 * Declaration defs are source-binding facts, not SSA result definitions. They
 * describe whether an operation introduces or initializes a declaration cell.
 */
export interface DeclarationDef {
  readonly kind: DeclarationDefKind;
  readonly declarationId: DeclarationId;
}

/**
 * Source declaration referenced by an operation.
 *
 * Declaration uses are intentionally separate from value operands and memory
 * effects. They answer whether a source binding must continue to exist, not
 * which SSA value or runtime memory location an operation reads.
 */
export interface DeclarationUse {
  readonly kind: DeclarationUseKind;
  readonly declarationId: DeclarationId;
}

/**
 * Operation-local declaration facts consumed by module-level reference
 * analyses and declaration elimination.
 */
export interface DeclarationEffects {
  readonly defs: readonly DeclarationDef[];
  readonly uses: readonly DeclarationUse[];
}

const EmptyDeclarationEffects: DeclarationEffects = Object.freeze({
  defs: [],
  uses: [],
});

/**
 * Returns source declaration defs and uses for one operation.
 *
 * This is the declaration-level equivalent of `Operation.effects()`: operation
 * classes remain the source of truth for executable IR, while analyses build
 * cached indexes over this query when they need module-wide reference data.
 */
export function declarationEffects(op: Operation): DeclarationEffects {
  const valueUses = valueDeclarationUses(op.operands());

  if (op instanceof InitializeBindingOp) {
    return {
      defs: [{ kind: "initialize", declarationId: op.declarationId }],
      uses: valueUses,
    };
  }

  if (op instanceof LoadBindingOp) {
    return {
      defs: [],
      uses: uniqueUses([{ kind: "read", declarationId: op.declarationId }, ...valueUses]),
    };
  }

  if (op instanceof StoreBindingOp) {
    return {
      defs: [],
      uses: uniqueUses([{ kind: "write", declarationId: op.declarationId }, ...valueUses]),
    };
  }

  if (op instanceof CreateFunctionOp) {
    return {
      defs: [],
      uses: uniqueUses([
        ...op.captures.flatMap((capture) =>
          capture.declarationId === null
            ? []
            : [
                {
                  kind: "capture" as const,
                  declarationId: capture.declarationId,
                },
              ],
        ),
        ...valueUses,
      ]),
    };
  }

  if (op instanceof DeleteOp && op.target.kind === "binding") {
    return {
      defs: [],
      uses: uniqueUses([
        { kind: "delete", declarationId: op.target.declarationId },
        ...valueUses,
      ]),
    };
  }

  if (op instanceof DestructureBindingOp) {
    const declarations = bindingPatternDeclarations(op.target);

    return {
      defs:
        op.mode === "initialize"
          ? declarations.map((declarationId) => ({
              kind: "initialize" as const,
              declarationId,
            }))
          : [],
      uses: uniqueUses([
        ...(op.mode === "store"
          ? declarations.map((declarationId) => ({
              kind: "write" as const,
              declarationId,
            }))
          : []),
        ...valueUses,
      ]),
    };
  }

  return valueUses.length === 0 ? EmptyDeclarationEffects : { defs: [], uses: valueUses };
}

function valueDeclarationUses(values: readonly Value[]): readonly DeclarationUse[] {
  return uniqueUses(
    values.flatMap((value) =>
      value.declarationId === null
        ? []
        : [
            {
              kind: "value-flow" as const,
              declarationId: value.declarationId,
            },
          ],
    ),
  );
}

function bindingPatternDeclarations(target: BindingPatternTarget): readonly DeclarationId[] {
  switch (target.kind) {
    case "binding":
      return [target.declarationId];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : bindingPatternDeclarations(element),
      );

    case "object":
      return target.properties.flatMap((property) => bindingPatternDeclarations(property.target));

    case "rest":
      return bindingPatternDeclarations(target.target);

    case "default":
      return bindingPatternDeclarations(target.target);
  }
}

function uniqueUses(uses: readonly DeclarationUse[]): readonly DeclarationUse[] {
  const seen = new Set<string>();
  const unique: DeclarationUse[] = [];

  for (const use of uses) {
    const key = `${use.kind}:${use.declarationId}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(use);
  }

  return unique;
}
