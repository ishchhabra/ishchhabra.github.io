import type { Program } from "oxc-parser";
import { parseSync } from "oxc-parser";
import { readFileSync } from "fs";
import { Environment } from "../../environment";
import type { LexicalScopeId } from "../../ir/core/LexicalScope";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { analyzeScopes, type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

/**
 * Drives the parse-and-lower walk for a single module. Owns the
 * {@link ModuleIR} that is being populated; constructed up-front (with
 * empty registries) so that {@link FunctionIRBuilder} can set the
 * `moduleIR` back-pointer on every {@link FunctionIR} it creates.
 * Callers should reach through `moduleIR.functions` / `moduleIR.exports`
 * / etc. directly — the builder is purely a parse driver, not a
 * façade over the module.
 */
export class ModuleIRBuilder {
  public readonly moduleIR: ModuleIR;
  public readonly scopeToLexicalScope: Map<Scope, LexicalScopeId> = new Map();

  constructor(path: string, environment: Environment) {
    this.moduleIR = new ModuleIR(path, environment);
  }

  public buildFromSource(source: string): ModuleIR {
    return this.buildFromCode(source);
  }

  public build(): ModuleIR {
    return this.buildFromCode(readFileSync(this.moduleIR.path, "utf-8"));
  }

  private buildFromCode(code: string): ModuleIR {
    const result = parseSync(this.moduleIR.path, code, {
      sourceType: "module",
      astType: "ts",
      preserveParens: false,
    });

    if (result.errors.length > 0) {
      const msg = result.errors.map((e) => e.message).join("\n");
      throw new Error(`Parse errors in ${this.moduleIR.path}:\n${msg}`);
    }

    const program = result.program as unknown as Program;
    const { programScope, scopeMap } = analyzeScopes(program);

    new FunctionIRBuilder(
      [],
      program,
      programScope,
      scopeMap,
      this.moduleIR.environment,
      this,
      false,
      false,
    ).build();

    return this.moduleIR;
  }
}
