import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

import type {
  LoadedModule,
  ModuleEnvironment,
  ModuleHost,
  ResolvedModule,
} from "../compile/ModuleHost";
import { parseModule } from "../frontend/parse/parseModule";
import type { ProgramModuleKind } from "../ir/core/ProgramModule";

const COMPILABLE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs"]);

interface ViteModuleHostContext {
  resolve(
    specifier: string,
    importer?: string,
    options?: { readonly skipSelf?: boolean },
  ): Promise<{ readonly id: string; readonly external?: boolean | "absolute" } | null>;

  load(options: { readonly id: string }): Promise<{ readonly code?: string | null } | null>;
}

export interface ViteModuleHostOptions {
  readonly environment: ModuleEnvironment;
}

/**
 * Creates a module host backed by Vite/Rollup plugin resolution and loading.
 *
 * The compiler should not implement package exports, aliases, virtual modules,
 * or node_modules resolution itself. This adapter delegates those decisions to
 * the active Vite plugin pipeline.
 */
export function createViteModuleHost(
  context: ViteModuleHostContext,
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
  options: ViteModuleHostOptions,
): ModuleHost {
  return new ViteModuleHost(context, sourceOverrides, options.environment);
}

class ViteModuleHost implements ModuleHost {
  constructor(
    private readonly context: ViteModuleHostContext,
    private readonly sourceOverrides: ReadonlyMap<string, string>,
    private readonly environment: ModuleEnvironment,
  ) {}

  public async resolve(specifier: string, importer: string | null): Promise<ResolvedModule> {
    const resolved = await this.context.resolve(specifier, importer ?? undefined, {
      skipSelf: true,
    });

    if (resolved === null) {
      return {
        resolvedId: specifier,
        external: true,
      };
    }

    return {
      resolvedId: resolved.id,
      external: resolved.external === true,
    };
  }

  public async load(resolved: ResolvedModule): Promise<LoadedModule> {
    if (resolved.external) {
      return {
        resolvedId: resolved.resolvedId,
        source: null,
        kind: "external",
      };
    }

    const kind = kindFromResolvedId(resolved.resolvedId);
    if (kind !== "esm") {
      return {
        resolvedId: resolved.resolvedId,
        source: null,
        kind,
      };
    }

    const source = await this.loadSource(resolved.resolvedId);

    if (source === null) {
      return {
        resolvedId: resolved.resolvedId,
        source: null,
        kind: "opaque",
      };
    }

    if (
      this.environment.consumer === "client" &&
      sourceHasStaticNodeBuiltinDependency(resolved.resolvedId, source)
    ) {
      return {
        resolvedId: resolved.resolvedId,
        source: null,
        kind: "opaque",
      };
    }

    return {
      resolvedId: resolved.resolvedId,
      source,
      kind,
    };
  }

  private async loadSource(resolvedId: string): Promise<string | null> {
    const overriddenSource = this.sourceOverrides.get(resolvedId);
    if (overriddenSource !== undefined) return overriddenSource;

    const loaded = await this.context.load({ id: resolvedId });
    if (loaded?.code != null) return loaded.code;

    const filePath = filePathFromResolvedId(resolvedId);
    return filePath === null ? null : readFile(filePath, "utf8");
  }
}

function filePathFromResolvedId(resolvedId: string): string | null {
  const queryIndex = resolvedId.indexOf("?");
  const filePath = queryIndex === -1 ? resolvedId : resolvedId.slice(0, queryIndex);

  if (!path.isAbsolute(filePath)) return null;
  return filePath;
}

function kindFromResolvedId(resolvedId: string): ProgramModuleKind {
  if (resolvedId.startsWith("\0") || resolvedId.startsWith("virtual:")) {
    return "virtual";
  }

  if (resolvedId.startsWith("node:")) {
    return "external";
  }

  if (hasOpaqueViteQuery(resolvedId)) {
    return "opaque";
  }

  if (resolvedId.endsWith(".json")) {
    return "json";
  }

  if (isCompilableJavaScript(resolvedId)) {
    return "esm";
  }

  if (isAsset(resolvedId)) {
    return "asset";
  }

  return "opaque";
}

function hasOpaqueViteQuery(resolvedId: string): boolean {
  const queryIndex = resolvedId.indexOf("?");
  if (queryIndex === -1) return false;

  const params = new URLSearchParams(resolvedId.slice(queryIndex + 1));
  return (
    params.has("worker") ||
    params.has("sharedworker") ||
    params.has("raw") ||
    params.has("url") ||
    params.has("inline")
  );
}

function isCompilableJavaScript(resolvedId: string): boolean {
  const queryIndex = resolvedId.indexOf("?");
  const filePath = queryIndex === -1 ? resolvedId : resolvedId.slice(0, queryIndex);

  return [...COMPILABLE_EXTENSIONS].some((extension) => filePath.endsWith(extension));
}

function isAsset(resolvedId: string): boolean {
  const queryIndex = resolvedId.indexOf("?");
  const filePath = queryIndex === -1 ? resolvedId : resolvedId.slice(0, queryIndex);

  return (
    filePath.endsWith(".css") ||
    filePath.endsWith(".svg") ||
    filePath.endsWith(".png") ||
    filePath.endsWith(".jpg") ||
    filePath.endsWith(".jpeg") ||
    filePath.endsWith(".gif") ||
    filePath.endsWith(".webp") ||
    filePath.endsWith(".woff") ||
    filePath.endsWith(".woff2")
  );
}

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

function sourceHasStaticNodeBuiltinDependency(resolvedId: string, source: string): boolean {
  const program = parseModule(resolvedId, source);

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      if (NODE_BUILTINS.has(statement.source.value)) return true;
      continue;
    }

    if (
      (statement.type === "ExportNamedDeclaration" || statement.type === "ExportAllDeclaration") &&
      statement.source !== null &&
      NODE_BUILTINS.has(statement.source.value)
    ) {
      return true;
    }
  }

  return false;
}
