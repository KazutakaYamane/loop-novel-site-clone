import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  test("ロゴはサイト名を代わりの文字に持ち、トップへのリンクになる", () => {
    render(<SiteHeader />);

    const banner = screen.getByRole("banner");
    const logo = within(banner).getByRole("img", { name: "ヨミカキ" });
    expect(logo.closest("a")).toHaveAttribute("href", "/");
    expect(within(banner).queryByRole("img", { name: /カクヨム/ })).toBeNull();
  });

  test("スマートフォンの幅のナビゲーションにホームへのリンクがある", () => {
    render(<SiteHeader />);

    const nav = screen.getByRole("navigation", { name: "サイト内の移動" });
    expect(within(nav).getByRole("link", { name: "ホーム" })).toHaveAttribute("href", "/");
  });

  test("@AC-F7-3 ランキング・検索・ジャンル一覧への導線を出さない", () => {
    render(<SiteHeader />);

    const banner = screen.getByRole("banner");
    expect(within(banner).queryByRole("link", { name: /ランキング|検索|探す|ジャンル/ })).toBeNull();
    expect(within(banner).queryByRole("search")).toBeNull();
    expect(within(banner).queryByRole("searchbox")).toBeNull();
    for (const link of within(banner).getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/ranking|search|explore|genre/);
    }
  });

  test("後の issue が操作を足す領域を持つ", () => {
    render(<SiteHeader />);

    expect(within(screen.getByRole("banner")).getByTestId("header-actions")).toBeInTheDocument();
  });
});
