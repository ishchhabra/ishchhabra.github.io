import { existsSync } from "fs";
import { Environment } from "../environment";
import { ModuleIR } from "../ir/core/ModuleIR";
import { ModuleIRBuilder } from "./hir/ModuleIRBuilder";

export interface ProjectBuilderOptions {
  includeNodeModules?: boolean;
}

export interface ProjectUnit {
  modules: Map<string, ModuleIR>;
  postOrder: string[];
  compiledNodeModulePackages: string[];
  opaqueNodeModulePackages: string[];
}

export class ProjectBuilder {
  private readonly modules: Map<string, ModuleIR> = new Map();
  private readonly includeNodeModules: boolean;
  private readonly compiledNodeModulePackages: Set<string> = new Set();
  private readonly opaqueNodeModulePackages: Set<string> = new Set();

  constructor(options: ProjectBuilderOptions = {}) {
    this.includeNodeModules = options.includeNodeModules ?? false;
  }

  public build(entryPoint: string): ProjectUnit {
    this.buildModule(entryPoint);
    const postOrder = this.getPostOrder(this.modules.get(entryPoint)!);
    return {
      modules: this.modules,
      postOrder,
      compiledNodeModulePackages: [...this.compiledNodeModulePackages],
      opaqueNodeModulePackages: [...this.opaqueNodeModulePackages],
    };
  }

  /**
   * Builds a ProjectUnit from multiple entry points. Each entry point is
   * built independently (discovering its dependencies), and the post-order
   * traversal covers all reachable modules from all entries.
   */
  public getProjectUnit(entryPoints: string[]): ProjectUnit {
    const visited = new Set<string>();
    const result: string[] = [];

    for (const entry of entryPoints) {
      const moduleIR = this.modules.get(entry);
      if (moduleIR) {
        this.visitPostOrder(moduleIR, visited, result);
      }
    }

    return {
      modules: this.modules,
      postOrder: result,
      compiledNodeModulePackages: [...this.compiledNodeModulePackages],
      opaqueNodeModulePackages: [...this.opaqueNodeModulePackages],
    };
  }

  public markOpaqueNodeModulePackage(packageRoot: string): void {
    this.opaqueNodeModulePackages.add(packageRoot);
    this.compiledNodeModulePackages.delete(packageRoot);
    for (const modulePath of this.modules.keys()) {
      if (isModuleInPackage(modulePath, packageRoot)) {
        this.modules.delete(modulePath);
      }
    }
  }

  private buildModule(path: string): ModuleIR | undefined {
    if (this.modules.has(path)) {
      return this.modules.get(path)!;
    }

    const packageRoot = getNodeModulePackageRoot(path);
    if (packageRoot !== undefined && this.opaqueNodeModulePackages.has(packageRoot)) {
      return undefined;
    }

    const environment = new Environment();
    let moduleIR: ModuleIR;
    try {
      moduleIR = new ModuleIRBuilder(path, environment).build();
    } catch (error) {
      if (packageRoot !== undefined && this.includeNodeModules) {
        this.markOpaqueNodeModulePackage(packageRoot);
        return undefined;
      }
      throw error;
    }

    this.modules.set(path, moduleIR);
    if (packageRoot !== undefined) {
      this.compiledNodeModulePackages.add(packageRoot);
    }

    const imports = Array.from(moduleIR.globals.values()).filter(
      (global) => global.kind === "import",
    );
    for (const { source } of imports) {
      if (!source.startsWith("/") || !existsSync(source)) {
        continue;
      }
      if (!this.includeNodeModules && source.includes("/node_modules/")) {
        continue;
      }
      this.buildModule(source);
    }

    return moduleIR;
  }

  private getPostOrder(moduleIR: ModuleIR) {
    const visited = new Set<string>();
    const result: string[] = [];
    this.visitPostOrder(moduleIR, visited, result);
    return result;
  }

  private visitPostOrder(moduleIR: ModuleIR, visited: Set<string>, result: string[]) {
    if (visited.has(moduleIR.path)) {
      return;
    }

    visited.add(moduleIR.path);
    result.push(moduleIR.path);

    const imports = Array.from(moduleIR.globals.values()).filter(
      (global) => global.kind === "import",
    );
    for (const { source } of imports) {
      const mod = this.modules.get(source);
      if (mod === undefined) {
        continue;
      }

      this.visitPostOrder(mod, visited, result);
    }
  }
}

export function getNodeModulePackageRoot(modulePath: string): string | undefined {
  const normalizedPath = modulePath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");
  for (let i = segments.length - 2; i >= 0; i--) {
    if (segments[i] !== "node_modules") {
      continue;
    }
    const packageName = segments[i + 1];
    if (packageName === undefined || packageName === "") {
      return undefined;
    }
    if (packageName.startsWith("@")) {
      const scopedName = segments[i + 2];
      if (scopedName === undefined || scopedName === "") {
        return undefined;
      }
      return segments.slice(0, i + 3).join("/");
    }
    return segments.slice(0, i + 2).join("/");
  }
  return undefined;
}

function isModuleInPackage(modulePath: string, packageRoot: string): boolean {
  const normalizedPath = modulePath.replace(/\\/g, "/");
  return normalizedPath === packageRoot || normalizedPath.startsWith(`${packageRoot}/`);
}
