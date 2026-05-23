import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

import { compileSource } from "../../dist/compile/index.js";
import { expandScenarioDescriptor } from "./discover.mjs";
import { test262Dir, test262HarnessDir } from "./paths.mjs";

const baseHarnessFiles = ["sta.js", "assert.js"];

export async function runScenario(descriptor) {
  const scenario = loadScenario(descriptor);

  if (scenario.variant === "module") {
    return {
      status: "fail",
      phase: "unsupported",
      message: "Module Test262 scenarios are not supported by this runner yet",
    };
  }

  const source = scenarioSource(scenario);
  const compile = compileScenario(source, scenario);

  if (scenario.negative !== null && scenario.negative.phase !== "runtime") {
    if (!compile.ok) return expectedError(compile.error, scenario.negative);
    return {
      status: "fail",
      phase: scenario.negative.phase,
      message: `Expected ${scenario.negative.type} during ${scenario.negative.phase}, but compilation succeeded`,
    };
  }

  if (!compile.ok) {
    return {
      status: "fail",
      phase: "compile",
      message: compile.error.message,
      errorName: compile.error.name,
    };
  }

  const runtime = await executeCompiledCode(compile.code, scenario);

  if (scenario.negative?.phase === "runtime") {
    if (!runtime.ok) return expectedError(runtime.error, scenario.negative);
    return {
      status: "fail",
      phase: "runtime",
      message: `Expected ${scenario.negative.type} during runtime, but no error was thrown`,
    };
  }

  if (!runtime.ok) {
    return {
      status: "fail",
      phase: "runtime",
      message: runtime.error.message,
      errorName: runtime.error.name,
      stack: runtime.error.stack,
    };
  }

  return { status: "pass" };
}

function loadScenario(descriptor) {
  const source = readFileSync(resolve(test262Dir, descriptor.file), "utf8");
  return expandScenarioDescriptor(descriptor, source);
}

function scenarioSource(scenario) {
  const prefix = scenario.variant === "strict" ? '"use strict";\n' : "";
  return `${prefix}${scenario.body}`;
}

function compileScenario(source, scenario) {
  try {
    const result = compileSource(source, {
      sourceName: scenario.file,
    });
    return { ok: true, code: result.code };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

async function executeCompiledCode(code, scenario) {
  const context = createContext(scenario);

  try {
    loadHarness(context, scenario);

    if (scenario.flags.includes("async")) {
      await executeAsync(code, context, scenario);
    } else {
      vm.runInContext(code, context, runOptions(scenario.id));
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

function createContext(_scenario) {
  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  });
  context.$262 = {
    global: context,
    IsHTMLDDA: undefined,
    detachArrayBuffer() {
      throw new Error("$262.detachArrayBuffer is not implemented by this runner");
    },
    evalScript(source) {
      const result = compileSource(String(source), {
        sourceName: "$262.evalScript",
      });
      return vm.runInContext(result.code, context, runOptions("$262.evalScript"));
    },
    createRealm() {
      const realmContext = createContext(_scenario);
      loadHarness(realmContext, { ..._scenario, includes: [] });
      return { global: realmContext };
    },
    gc() {},
  };
  return context;
}

function loadHarness(context, scenario) {
  if (scenario.flags.includes("raw")) return;

  const includes = [...new Set([...baseHarnessFiles, ...scenario.includes])];
  if (scenario.flags.includes("async")) {
    includes.push("doneprintHandle.js");
  }

  for (const include of includes) {
    const path = resolve(test262HarnessDir, include);
    const source = readFileSync(path, "utf8");
    vm.runInContext(source, context, { filename: `harness/${include}`, timeout: 10_000 });
  }
}

async function executeAsync(code, context, scenario) {
  await new Promise((resolvePromise, rejectPromise) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      rejectPromise(new Error("$DONE was not called before timeout"));
    }, 10_000);

    context.$DONE = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        rejectPromise(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolvePromise();
      }
    };

    try {
      vm.runInContext(code, context, runOptions(scenario.id));
    } catch (error) {
      clearTimeout(timer);
      finished = true;
      rejectPromise(error);
    }
  });
}

function expectedError(error, negative) {
  if (error.name === negative.type) {
    return { status: "pass" };
  }

  return {
    status: "fail",
    phase: negative.phase,
    message: `Expected ${negative.type}, got ${error.name}: ${error.message}`,
    errorName: error.name,
  };
}

function runOptions(filename) {
  return {
    filename,
    timeout: 10_000,
    importModuleDynamically() {
      const rejection = Promise.reject(new Error("Dynamic import is not supported by this runner"));
      rejection.catch(() => {});
      return rejection;
    },
  };
}

function normalizeError(error) {
  if (error instanceof Error) return error;

  if (error !== null && typeof error === "object") {
    const normalized = new Error(String(error.message ?? error));
    normalized.name = String(error.name ?? "Error");
    if ("stack" in error) normalized.stack = String(error.stack);
    return normalized;
  }

  return new Error(String(error));
}
