import type * as ESTree from "estree";
import { parseSync } from "oxc-parser";
import { readFileSync } from "fs";
import { Environment } from "../../environment";
import type { LexicalScopeId } from "../../ir/core/LexicalScope";
import { FunctionIR, FunctionIRId } from "../../ir/core/FunctionIR";
import { ModuleExport, ModuleGlobal, ModuleIR } from "../../ir/core/ModuleIR";
import { analyzeScopes, type Scope } from "../scope/Scope";
import { FunctionIRBuilder } from "./FunctionIRBuilder";

export class ModuleIRBuilder {
  public readonly globals: Map<string, ModuleGlobal> = new Map();
  public readonly exports: Map<string, ModuleExport> = new Map();

  public readonly functions: Map<FunctionIRId, FunctionIR> = new Map();
  public readonly scopeToLexicalScope: Map<Scope, LexicalScopeId> = new Map();

  constructor(
    public readonly path: string,
    public readonly environment: Environment,
  ) {}

  public buildFromSource(source: string): ModuleIR {
    return this.buildFromCode(source);
  }

  public build(): ModuleIR {
    return this.buildFromCode(readFileSync(this.path, "utf-8"));
  }

  private buildFromCode(code: string): ModuleIR {
    const result = parseSync(this.path, code, {
      sourceType: "module",
      astType: "ts",
      preserveParens: false,
    });

    if (result.errors.length > 0) {
      const msg = result.errors.map((e) => e.message).join("\n");
      throw new Error(`Parse errors in ${this.path}:\n${msg}`);
    }

    const program = result.program as unknown as ESTree.Program;
    const { programScope, scopeMap } = analyzeScopes(program);

    const functionIR = new FunctionIRBuilder(
      [],
      program,
      program,
      programScope,
      scopeMap,
      this.environment,
      this,
      false,
      false,
    ).build();
    this.functions.set(functionIR.id, functionIR);

    return {
      environment: this.environment,
      path: this.path,
      functions: this.functions,
      globals: this.globals,
      exports: this.exports,
    };
  }
}
