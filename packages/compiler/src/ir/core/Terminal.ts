import { BaseTerminal } from "../base";
import { InstructionId } from "../base/Instruction";
import { BlockId } from "./Block";
import { Identifier } from "./Identifier";
import { Place } from "./Place";

export class BranchTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly test: Place,
    public consequent: BlockId,
    public alternate: BlockId,
    public fallthrough: BlockId,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [this.test];
  }

  rewrite(values: Map<Identifier, Place>): BranchTerminal {
    const test = values.get(this.test.identifier) ?? this.test;
    if (test === this.test) return this;
    return new BranchTerminal(this.id, test, this.consequent, this.alternate, this.fallthrough);
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.consequent === from) this.consequent = to;
    if (this.alternate === from) this.alternate = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }

  getBlockRefs(): BlockId[] {
    return [this.consequent, this.alternate, this.fallthrough];
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }
}

export class JumpTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public target: BlockId,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): JumpTerminal {
    return this;
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.target === from) this.target = to;
  }

  getBlockRefs(): BlockId[] {
    return [this.target];
  }
}

export class ReturnTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly value: Place | null,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return this.value ? [this.value] : [];
  }

  rewrite(values: Map<Identifier, Place>): ReturnTerminal {
    if (!this.value) return this;
    const value = values.get(this.value.identifier) ?? this.value;
    if (value === this.value) return this;
    return new ReturnTerminal(this.id, value);
  }

  remap(): void {}

  getBlockRefs(): BlockId[] {
    return [];
  }
}

export class ThrowTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly value: Place,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  rewrite(values: Map<Identifier, Place>): ThrowTerminal {
    const value = values.get(this.value.identifier) ?? this.value;
    if (value === this.value) return this;
    return new ThrowTerminal(this.id, value);
  }

  remap(): void {}

  getBlockRefs(): BlockId[] {
    return [];
  }
}

export class SwitchTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly discriminant: Place,
    public readonly cases: Array<{ test: Place | null; block: BlockId }>,
    public fallthrough: BlockId,
    public readonly label?: string,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    const places = [this.discriminant];
    for (const c of this.cases) {
      if (c.test !== null) {
        places.push(c.test);
      }
    }
    return places;
  }

  rewrite(values: Map<Identifier, Place>): SwitchTerminal {
    const discriminant = values.get(this.discriminant.identifier) ?? this.discriminant;
    const cases = this.cases.map((c) => ({
      test: c.test !== null ? (values.get(c.test.identifier) ?? c.test) : null,
      block: c.block,
    }));
    if (
      discriminant === this.discriminant &&
      cases.every((c, i) => c.test === this.cases[i].test)
    ) {
      return this;
    }
    return new SwitchTerminal(this.id, discriminant, cases, this.fallthrough, this.label);
  }

  remap(from: BlockId, to: BlockId): void {
    for (const c of this.cases) {
      if (c.block === from) c.block = to;
    }
    if (this.fallthrough === from) this.fallthrough = to;
  }

  getBlockRefs(): BlockId[] {
    return [...this.cases.map((c) => c.block), this.fallthrough];
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }
}

export class TryTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public tryBlock: BlockId,
    public handler: { param: Place | null; block: BlockId } | null,
    public finallyBlock: BlockId | null,
    public fallthrough: BlockId,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): TryTerminal {
    return this;
  }

  remap(from: BlockId, to: BlockId): void {
    if (this.tryBlock === from) this.tryBlock = to;
    if (this.handler?.block === from) this.handler.block = to;
    if (this.finallyBlock === from) this.finallyBlock = to;
    if (this.fallthrough === from) this.fallthrough = to;
  }

  getBlockRefs(): BlockId[] {
    const refs: BlockId[] = [this.tryBlock, this.fallthrough];
    if (this.handler) refs.push(this.handler.block);
    if (this.finallyBlock !== null) refs.push(this.finallyBlock);
    return refs;
  }

  override getJoinTarget(): BlockId {
    return this.fallthrough;
  }
}
