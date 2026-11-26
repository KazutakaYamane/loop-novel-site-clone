import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("トップの見出しにサイト名を出す", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { level: 1, name: "ヨミカキ" })).toBeInTheDocument();
});

test("@AC-F7-3 トップにランキング・検索・ジャンル一覧への導線を出さない", () => {
  render(<Home />);

  expect(screen.queryByRole("link", { name: /ランキング|検索|探す|ジャンル/ })).toBeNull();
  expect(screen.queryByRole("search")).toBeNull();
});
