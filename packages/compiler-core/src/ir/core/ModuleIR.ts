import { FunctionIR } from "./FunctionIR";
import type { ModuleExport } from "./ModuleExport";
import type { ModuleImport } from "./ModuleImport";

declare const opaqueModuleId: unique symbol;

/**
 * Stable identity of an IR module.
 *
 * Module ids are for diagnostics, maps, and serialization. They do not imply
 * filesystem identity or module loading order.
 */
export type ModuleId = number & {
  readonly [opaqueModuleId]: "ModuleId";
};

export function makeModuleId(id: number): ModuleId {
  return id as ModuleId;
}

/**
 * The compilation unit for a single source file.
 */
export class ModuleIR {
  readonly #functions: FunctionIR[] = [];
  readonly #imports: ModuleImport[] = [];
  readonly #exports: ModuleExport[] = [];
  #entryFunction: FunctionIR | null = null;

  constructor(public readonly id: ModuleId) {}

  /**
   * Functions owned by this module.
   */
  public get functions(): readonly FunctionIR[] {
    return this.#functions;
  }

  /**
   * Static imports declared by this module.
   *
   * These records are consumed by codegen and future linking. Runtime dynamic
   * imports are represented separately by `ImportExpressionOp`.
   */
  public get imports(): readonly ModuleImport[] {
    return this.#imports;
  }

  /**
   * Static exports declared by this module.
   *
   * Local exports point at declarations owned by this module. Re-exports point
   * at source modules and are resolved by the linker.
   */
  public get exports(): readonly ModuleExport[] {
    return this.#exports;
  }

  /**
   * Function that executes this module's top-level code.
   *
   * Null means the module is still being assembled.
   */
  public get entryFunction(): FunctionIR | null {
    return this.#entryFunction;
  }

  /**
   * Adds a function to this module and records module ownership.
   *
   * Throws if the function already belongs to another module.
   */
  public addFunction(fn: FunctionIR): void {
    if (fn.ownerModule !== null && fn.ownerModule !== this) {
      throw new Error(`Function#${fn.id} already belongs to another module`);
    }

    if (this.functions.includes(fn)) {
      throw new Error(`Function#${fn.id} already belongs to this module`);
    }

    if (this.#functions.some((owned) => owned.id === fn.id)) {
      throw new Error(`Function#${fn.id} already exists in Module#${this.id}`);
    }

    fn.ownerModule = this;
    this.#functions.push(fn);
  }

  /**
   * Adds a static import record.
   */
  public addImport(record: ModuleImport): void {
    this.#imports.push(record);
  }

  /**
   * Adds a static export record.
   */
  public addExport(record: ModuleExport): void {
    this.#exports.push(record);
  }

  /**
   * Removes a non-entry function from this module.
   */
  public removeFunction(fn: FunctionIR): void {
    if (this.entryFunction === fn) {
      throw new Error(`Cannot remove entry Function#${fn.id} from Module#${this.id}`);
    }

    const index = this.#functions.indexOf(fn);
    if (index === -1) {
      throw new Error(`Function#${fn.id} does not belong to Module#${this.id}`);
    }

    fn.ownerModule = null;
    this.#functions.splice(index, 1);
  }

  /**
   * Looks up an owned function by id.
   */
  public getFunction(id: FunctionIR["id"]): FunctionIR {
    const fn = this.#functions.find((candidate) => candidate.id === id);
    if (fn === undefined) {
      throw new Error(`Function#${id} does not belong to Module#${this.id}`);
    }

    return fn;
  }

  /**
   * Marks an owned function as this module's top-level entry point.
   */
  public setEntryFunction(fn: FunctionIR): void {
    if (!this.#functions.includes(fn)) {
      throw new Error(`Function#${fn.id} is not owned by Module#${this.id}`);
    }

    this.#entryFunction = fn;
  }
}
