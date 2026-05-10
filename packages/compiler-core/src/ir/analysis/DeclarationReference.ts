import type { FunctionIR } from "../core/FunctionIR";
import type { ModuleExport } from "../core/ModuleExport";
import type { ModuleImport } from "../core/ModuleImport";
import type { ModuleIR } from "../core/ModuleIR";
import type { Operation } from "../core/Operation";
import type { DeclarationId, Value } from "../core/Value";
import {
  declarationEffects,
  type DeclarationDef,
  type DeclarationDefKind,
  type DeclarationUse,
  type DeclarationUseKind,
} from "./DeclarationEffects";
import type { AnalysisManager, ModuleAnalysis } from "./AnalysisManager";

export type DeclarationReferenceSource = FunctionIR | ModuleExport | ModuleImport | Operation;

/**
 * Closed set of source declaration reference categories.
 *
 * These are declaration identity facts, not SSA value uses. A reference answers
 * why a source binding must keep its declaration cell or why a declaration was
 * introduced into the module's source-binding graph.
 */
export type DeclarationReferenceKind =
  | DeclarationDefinitionReferenceKind
  | DeclarationUseReferenceKind;

/**
 * Declaration-producing references.
 *
 * @example
 * ```js
 * import { read } from "./data.js";
 * function fn(param) {}
 * ```
 * Imports, parameters, block parameters, and binding initializers define source
 * declaration identities.
 */
export type DeclarationDefinitionReferenceKind =
  | DeclarationDefKind
  | "block-parameter"
  | "import"
  | "parameter";

/**
 * Declaration-consuming references.
 *
 * @example
 * ```js
 * function f() {}
 * f();
 * delete f;
 * export { f };
 * ```
 * Reads, writes, captures, deletes, value flows, and exports keep source
 * declarations observable even when ordinary SSA users do not mention them.
 */
export type DeclarationUseReferenceKind = DeclarationUseKind | "export";

/**
 * One source declaration reference in a module.
 *
 * @example
 * ```js
 * function used() {}
 * used();
 * ```
 * The function declaration has an `"initialize"` definition reference, while
 * the call path contributes a `"read"` use reference through `LoadBindingOp`.
 *
 * @example
 * ```js
 * function deleted() {}
 * delete deleted;
 * ```
 * `delete` does not read the function value, but it still contributes a
 * `"delete"` use reference because the binding identity is observed.
 */
export interface DeclarationReference {
  readonly declarationId: DeclarationId;
  readonly kind: DeclarationReferenceKind;
  readonly source: DeclarationReferenceSource;
}

/**
 * Module-wide declaration def/use index.
 */
export class DeclarationReferences {
  constructor(
    private readonly defsByDeclaration: ReadonlyMap<DeclarationId, readonly DeclarationReference[]>,
    private readonly usesByDeclaration: ReadonlyMap<DeclarationId, readonly DeclarationReference[]>,
  ) {}

  /**
   * Declaration definitions in module order.
   */
  public definitions(declarationId: DeclarationId): readonly DeclarationReference[] {
    return this.defsByDeclaration.get(declarationId) ?? [];
  }

  /**
   * Declaration uses in module order.
   */
  public uses(declarationId: DeclarationId): readonly DeclarationReference[] {
    return this.usesByDeclaration.get(declarationId) ?? [];
  }

  /**
   * Returns whether any surviving IR or module boundary references a
   * declaration.
   */
  public isReferenced(declarationId: DeclarationId): boolean {
    return this.uses(declarationId).length > 0;
  }
}

/**
 * Builds a source declaration reference index for one module.
 */
export const DeclarationReferenceAnalysis = {
  name: "declaration-reference",

  run(moduleIR: ModuleIR, _analyses: AnalysisManager): DeclarationReferences {
    const defsByDeclaration = new Map<DeclarationId, DeclarationReference[]>();
    const usesByDeclaration = new Map<DeclarationId, DeclarationReference[]>();

    for (const record of moduleIR.imports) {
      if (record.kind === "bare") continue;

      append(defsByDeclaration, record.declarationId, {
        declarationId: record.declarationId,
        kind: "import",
        source: record,
      });
    }

    for (const record of moduleIR.exports) {
      switch (record.kind) {
        case "local":
        case "default-local":
          append(usesByDeclaration, record.declarationId, {
            declarationId: record.declarationId,
            kind: "export",
            source: record,
          });
          break;

        case "default-value":
          appendValueUse(usesByDeclaration, record.value, record, "export");
          break;

        case "re-export":
        case "export-all":
          break;
      }
    }

    for (const fn of moduleIR.functions) {
      for (const param of fn.params) {
        if (param.value.declarationId === null) continue;

        append(defsByDeclaration, param.value.declarationId, {
          declarationId: param.value.declarationId,
          kind: "parameter",
          source: fn,
        });
      }

      for (const block of fn.blocks) {
        for (const param of block.params) {
          if (param.declarationId === null) continue;

          append(defsByDeclaration, param.declarationId, {
            declarationId: param.declarationId,
            kind: "block-parameter",
            source: fn,
          });
        }

        for (const op of block.operations) {
          const effects = declarationEffects(op);

          for (const def of effects.defs) {
            appendDef(defsByDeclaration, def, op);
          }

          for (const use of effects.uses) {
            appendUse(usesByDeclaration, use, op);
          }
        }
      }
    }

    return new DeclarationReferences(defsByDeclaration, usesByDeclaration);
  },
} satisfies ModuleAnalysis<DeclarationReferences>;

function appendDef(
  map: Map<DeclarationId, DeclarationReference[]>,
  def: DeclarationDef,
  source: Operation,
): void {
  append(map, def.declarationId, {
    declarationId: def.declarationId,
    kind: def.kind,
    source,
  });
}

function appendUse(
  map: Map<DeclarationId, DeclarationReference[]>,
  use: DeclarationUse,
  source: Operation,
): void {
  append(map, use.declarationId, {
    declarationId: use.declarationId,
    kind: use.kind,
    source,
  });
}

function appendValueUse(
  map: Map<DeclarationId, DeclarationReference[]>,
  value: Value,
  source: DeclarationReferenceSource,
  kind: DeclarationUseReferenceKind,
): void {
  if (value.declarationId === null) return;

  append(map, value.declarationId, {
    declarationId: value.declarationId,
    kind,
    source,
  });
}

function append(
  map: Map<DeclarationId, DeclarationReference[]>,
  declarationId: DeclarationId,
  reference: DeclarationReference,
): void {
  const references = map.get(declarationId);

  if (references === undefined) {
    map.set(declarationId, [reference]);
    return;
  }

  references.push(reference);
}
