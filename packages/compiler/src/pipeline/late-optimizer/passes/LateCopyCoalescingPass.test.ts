import { describe, expect, it } from "vitest";
import { Environment } from "../../../environment";
import { ProjectEnvironment } from "../../../ProjectEnvironment";
import {
  BindingDeclOp,
  BindingInitOp,
  LiteralOp,
  LoadStaticPropertyOp,
  ReturnTermOp,
  StoreLocalOp,
} from "../../../ir";
import { FuncOp, makeFuncOpId } from "../../../ir/core/FuncOp";
import { ModuleIR } from "../../../ir/core/ModuleIR";
import { LateCopyCoalescingPass } from "./LateCopyCoalescingPass";

describe("LateCopyCoalescingPass", () => {
  it("coalesces an out-of-SSA initial copy into its declaration", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const initial = env.createValue();
    const target = env.createValue();

    block.appendOp(env.createOperation(LiteralOp, initial, 0));
    block.appendOp(env.createOperation(BindingDeclOp, target, "let"));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, initial));
    block.setTerminal(env.createOperation(ReturnTermOp, target));

    const result = new LateCopyCoalescingPass(funcOp).run();

    expect(result.changed).toBe(true);
    expect(block.operations.some((op) => op instanceof StoreLocalOp)).toBe(false);

    const init = block.operations.find((op) => op instanceof BindingInitOp);
    expect(init).toBeInstanceOf(BindingInitOp);
    expect(init?.place).toBe(target);
    expect(init?.value).toBe(initial);
  });

  it("coalesces through a declaration band", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const initial = env.createValue();
    const target = env.createValue();
    const other = env.createValue();

    block.appendOp(env.createOperation(LiteralOp, initial, 0));
    block.appendOp(env.createOperation(BindingDeclOp, target, "let"));
    block.appendOp(env.createOperation(BindingDeclOp, other, "let"));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, initial));
    block.setTerminal(env.createOperation(ReturnTermOp, target));

    const result = new LateCopyCoalescingPass(funcOp).run();

    expect(result.changed).toBe(true);
    expect(block.operations[1]).toBeInstanceOf(BindingInitOp);
    expect(block.operations[2]).toBeInstanceOf(BindingDeclOp);
  });

  it("does not turn self-assignment into a TDZ initializer", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const target = env.createValue();

    block.appendOp(env.createOperation(BindingDeclOp, target, "let"));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, target));
    block.setTerminal(env.createOperation(ReturnTermOp, target));

    const result = new LateCopyCoalescingPass(funcOp).run();

    expect(result.changed).toBe(false);
    expect(block.operations[0]).toBeInstanceOf(BindingDeclOp);
    expect(block.operations[1]).toBeInstanceOf(StoreLocalOp);
  });

  it("does not move an initial copy across a real operation", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const initial = env.createValue();
    const intervening = env.createValue();
    const target = env.createValue();

    block.appendOp(env.createOperation(BindingDeclOp, target, "let"));
    block.appendOp(env.createOperation(LiteralOp, intervening, 1));
    block.appendOp(env.createOperation(LiteralOp, initial, 0));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, initial));
    block.setTerminal(env.createOperation(ReturnTermOp, target));

    const result = new LateCopyCoalescingPass(funcOp).run();

    expect(result.changed).toBe(false);
    expect(block.operations[0]).toBeInstanceOf(BindingDeclOp);
    expect(block.operations[3]).toBeInstanceOf(StoreLocalOp);
  });

  it("does not coalesce effectful initializer expression trees", () => {
    const { env, funcOp, block } = createSingleBlockFunction();
    const object = env.createValue();
    const property = env.createValue();
    const target = env.createValue();

    block.appendOp(env.createOperation(LiteralOp, object, null));
    block.appendOp(env.createOperation(LoadStaticPropertyOp, property, object, "x"));
    block.appendOp(env.createOperation(BindingDeclOp, target, "let"));
    block.appendOp(env.createOperation(StoreLocalOp, env.createValue(), target, property));
    block.setTerminal(env.createOperation(ReturnTermOp, target));

    const result = new LateCopyCoalescingPass(funcOp).run();

    expect(result.changed).toBe(false);
    expect(block.operations[2]).toBeInstanceOf(BindingDeclOp);
    expect(block.operations[3]).toBeInstanceOf(StoreLocalOp);
  });
});

function createSingleBlockFunction(): {
  readonly env: Environment;
  readonly funcOp: FuncOp;
  readonly block: ReturnType<Environment["createBlock"]>;
} {
  const env = new Environment(new ProjectEnvironment());
  const moduleIR = new ModuleIR("m.js", env);
  const block = env.createBlock();
  const funcOp = new FuncOp(moduleIR, makeFuncOpId(env.nextOperationId++), [], false, false, [
    block,
  ]);
  return { env, funcOp, block };
}
