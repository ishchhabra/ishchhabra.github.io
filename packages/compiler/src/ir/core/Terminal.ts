import { BaseTerminal } from "../base";
import { InstructionId } from "../base/Instruction";
import { BlockId } from "./Block";
import { Identifier } from "./Identifier";
import { Place } from "./Place";

export class BranchTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly test: Place,
    public readonly consequent: BlockId,
    public readonly alternate: BlockId,
    /*
     * Ideally, the fallthrough block should be computed based on the
     * CFG. Currently, to simplify the implementation, we're just manually
     * including it during the IR construction. This makes the IR construction
     * more error-prone, but easier to implement.
     */
    public readonly fallthrough: BlockId,
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
}

export class JumpTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly target: BlockId,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): JumpTerminal {
    return this;
  }
}

export class ReturnTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly value: Place,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  rewrite(values: Map<Identifier, Place>): ReturnTerminal {
    const value = values.get(this.value.identifier) ?? this.value;
    if (value === this.value) return this;
    return new ReturnTerminal(this.id, value);
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
}

export class SwitchTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly discriminant: Place,
    public readonly cases: Array<{ test: Place | null; block: BlockId }>,
    public readonly fallthrough: BlockId,
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
    return new SwitchTerminal(this.id, discriminant, cases, this.fallthrough);
  }
}

export class TryTerminal extends BaseTerminal {
  constructor(
    id: InstructionId,
    public readonly tryBlock: BlockId,
    public readonly handler: { param: Place | null; block: BlockId } | null,
    public readonly finallyBlock: BlockId | null,
    public readonly fallthrough: BlockId,
  ) {
    super(id);
  }

  getReadPlaces(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): TryTerminal {
    return this;
  }
}
