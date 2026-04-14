import type { OperationId } from "../../core";
import type { Identifier } from "../../core/Identifier";
import {
  type CloneContext,
  nextId,
  Operation,
  remapPlace,
  remapRegion,
  Trait,
  VerifyError,
} from "../../core/Operation";
import type { Place } from "../../core/Place";
import { Region } from "../../core/Region";

/**
 * `try { ... } catch (e) { ... } finally { ... }`.
 *
 * Inline structured op with one, two, or three regions:
 *
 *   - `regions[0]`                             — try body
 *   - `regions[1]` (when handler)              — catch body
 *   - `regions[n]` (when finally)              — finally body
 *
 * No fallthrough field. The handler's catch-parameter is stored as
 * a dedicated `handlerParam` field so it survives cloning alongside
 * the region tree.
 */
export class TryOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.HasRegions]);

  public readonly handlerParam: Place | null;
  public readonly hasHandler: boolean;
  public readonly hasFinalizer: boolean;

  constructor(
    id: OperationId,
    tryRegion: Region,
    handler: { param: Place | null; region: Region } | null,
    finallyRegion: Region | null,
  ) {
    const regions: Region[] = [tryRegion];
    if (handler !== null) {
      regions.push(handler.region);
    }
    if (finallyRegion !== null) {
      regions.push(finallyRegion);
    }
    super(id, regions);
    this.handlerParam = handler?.param ?? null;
    this.hasHandler = handler !== null;
    this.hasFinalizer = finallyRegion !== null;
  }

  get tryRegion(): Region {
    return this.regions[0];
  }

  get handlerRegion(): Region | null {
    return this.hasHandler ? this.regions[1] : null;
  }

  get finallyRegion(): Region | null {
    if (!this.hasFinalizer) return null;
    const idx = this.hasHandler ? 2 : 1;
    return this.regions[idx];
  }

  getOperands(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): TryOp {
    return this;
  }

  clone(ctx: CloneContext): TryOp {
    const tryRegion = remapRegion(ctx, this.regions[0]);
    let handler: { param: Place | null; region: Region } | null = null;
    if (this.hasHandler) {
      handler = {
        param: this.handlerParam === null ? null : remapPlace(ctx, this.handlerParam),
        region: remapRegion(ctx, this.regions[1]),
      };
    }
    let finallyRegion: Region | null = null;
    if (this.hasFinalizer) {
      const idx = this.hasHandler ? 2 : 1;
      finallyRegion = remapRegion(ctx, this.regions[idx]);
    }
    return new TryOp(nextId(ctx), tryRegion, handler, finallyRegion);
  }

  override verify(): void {
    super.verify();
    if (!this.hasHandler && !this.hasFinalizer) {
      throw new VerifyError(this, "try has neither catch handler nor finally block");
    }
  }
}
