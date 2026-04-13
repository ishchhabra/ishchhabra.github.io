import * as t from "@babel/types";
import {
  ArrayDestructureOp,
  CopyOp,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadPhiOp,
  ObjectDestructureOp,
  StoreContextOp,
  StoreLocalOp,
} from "../../../../ir";
import type { MemoryOp } from "../../../../ir/categories";
import { LoadStaticPropertyOp } from "../../../../ir/ops/prop/LoadStaticProperty";
import { StoreDynamicPropertyOp } from "../../../../ir/ops/prop/StoreDynamicProperty";
import { StoreStaticPropertyOp } from "../../../../ir/ops/prop/StoreStaticProperty";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateCopyOp } from "./generateCopy";
import { generateArrayDestructureOp } from "./generateArrayDestructure";
import { generateLoadContextOp } from "./generateLoadContext";
import { generateLoadDynamicPropertyOp } from "./generateLoadDynamicProperty";
import { generateLoadGlobalOp } from "./generateLoadGlobal";
import { generateLoadLocalOp } from "./generateLoadLocal";
import { generateLoadPhiOp } from "./generateLoadPhi";
import { generateLoadStaticPropertyOp } from "./generateLoadStaticProperty";
import { generateObjectDestructureOp } from "./generateObjectDestructure";
import { generateStoreContextOp } from "./generateStoreContext";
import { generateStoreDynamicPropertyOp } from "./generateStoreDynamicProperty";
import { generateStoreLocalOp } from "./generateStoreLocal";
import { generateStoreStaticPropertyOp } from "./generateStoreStaticProperty";

export function generateMemoryOp(instruction: MemoryOp, generator: CodeGenerator): t.Node {
  if (instruction instanceof ArrayDestructureOp) {
    return generateArrayDestructureOp(instruction, generator);
  } else if (instruction instanceof CopyOp) {
    return generateCopyOp(instruction, generator);
  } else if (instruction instanceof LoadContextOp) {
    return generateLoadContextOp(instruction, generator);
  } else if (instruction instanceof LoadGlobalOp) {
    return generateLoadGlobalOp(instruction, generator);
  } else if (instruction instanceof LoadLocalOp) {
    return generateLoadLocalOp(instruction, generator);
  } else if (instruction instanceof LoadPhiOp) {
    return generateLoadPhiOp(instruction, generator);
  } else if (instruction instanceof LoadStaticPropertyOp) {
    return generateLoadStaticPropertyOp(instruction, generator);
  } else if (instruction instanceof LoadDynamicPropertyOp) {
    return generateLoadDynamicPropertyOp(instruction, generator);
  } else if (instruction instanceof ObjectDestructureOp) {
    return generateObjectDestructureOp(instruction, generator);
  } else if (instruction instanceof StoreContextOp) {
    return generateStoreContextOp(instruction, generator);
  } else if (instruction instanceof StoreLocalOp) {
    return generateStoreLocalOp(instruction, generator);
  } else if (instruction instanceof StoreStaticPropertyOp) {
    return generateStoreStaticPropertyOp(instruction, generator);
  } else if (instruction instanceof StoreDynamicPropertyOp) {
    return generateStoreDynamicPropertyOp(instruction, generator);
  }

  throw new Error(
    `Unsupported memory instruction: ${(instruction as { constructor: { name: string } }).constructor.name}`,
  );
}
