export type Foo = { x: number };
export interface Bar {
  y: string;
}
const a = 1 as number;
const b = a!;
export { a, b };
