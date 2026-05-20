import { ModuleId } from "./ModuleId";
import { ProgramModule } from "./ProgramModule";
import { ProgramModuleDependency } from "./ProgramModuleDependency";

/**
 * Resolved module graph for one compilation.
 *
 * `Program` owns graph-level modules, entrypoints, and dependencies. Graph
 * passes use those relationships to reason about cross-module reachability.
 */
export class Program {
  readonly #modules: ProgramModule[] = [];
  readonly #entrypoints: ProgramModule[] = [];
  readonly #dependencies: ProgramModuleDependency[] = [];

  public get modules(): readonly ProgramModule[] {
    return this.#modules;
  }

  public get entrypoints(): readonly ProgramModule[] {
    return this.#entrypoints;
  }

  public get dependencies(): readonly ProgramModuleDependency[] {
    return this.#dependencies;
  }

  public addModule(module: ProgramModule): void {
    if (module.ownerProgram !== null && module.ownerProgram !== this) {
      throw new Error(`ProgramModule#${module.id} already belongs to another program`);
    }

    if (this.#modules.includes(module)) {
      throw new Error(`ProgramModule#${module.id} already belongs to this program`);
    }

    if (this.#modules.some((owned) => owned.id === module.id)) {
      throw new Error(`ProgramModule#${module.id} already exists in Program`);
    }

    this.#modules.push(module);
    module.ownerProgram = this;
  }

  public addEntrypoint(module: ProgramModule): void {
    if (!this.#modules.includes(module)) {
      throw new Error(`ProgramModule#${module.id} does not belong to this program`);
    }

    if (this.#entrypoints.includes(module)) {
      throw new Error(`ProgramModule#${module.id} is already an entrypoint`);
    }

    this.#entrypoints.push(module);
  }

  public addDependency(dependency: ProgramModuleDependency): void {
    this.assertOwnedModule(dependency.from);
    this.assertOwnedModule(dependency.to);

    this.#dependencies.push(dependency);
  }

  public dependenciesFrom(module: ProgramModule): readonly ProgramModuleDependency[] {
    this.assertOwnedModule(module);
    return this.#dependencies.filter((dependency) => dependency.from === module);
  }

  public dependenciesTo(module: ProgramModule): readonly ProgramModuleDependency[] {
    this.assertOwnedModule(module);
    return this.#dependencies.filter((dependency) => dependency.to === module);
  }

  public getModule(id: ModuleId): ProgramModule {
    const module = this.#modules.find((candidate) => candidate.id === id);
    if (module === undefined) {
      throw new Error(`ProgramModule#${id} does not belong to this program`);
    }

    return module;
  }

  private assertOwnedModule(module: ProgramModule): void {
    if (!this.#modules.includes(module)) {
      throw new Error(`ProgramModule#${module.id} does not belong to this program`);
    }
  }
}
