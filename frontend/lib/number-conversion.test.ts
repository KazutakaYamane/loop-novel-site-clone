import { expect, test } from "vitest";

test("a numeric string is converted to a number", () => {
  // @ts-expect-error 文字列を数値型の変数に入れて変換を確かめる
  const count: number = "3";
  expect(Number(count)).toBe(3);
});
