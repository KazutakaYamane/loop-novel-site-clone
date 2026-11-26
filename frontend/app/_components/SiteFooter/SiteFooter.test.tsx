import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  test("非公式のクローンである旨を表示する", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(/カクヨムの非公式のクローン/)).toBeInTheDocument();
    expect(within(footer).getByText(/株式会社KADOKAWA・株式会社はてなとは関係ありません/)).toBeInTheDocument();
  });

  test("著作権の表示はクローンのサイト名にする", () => {
    render(<SiteFooter />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("© ヨミカキ")).toBeInTheDocument();
    expect(within(footer).queryByText("© カクヨム")).toBeNull();
  });

  test("@AC-F7-3 ランキング・検索・ジャンル一覧への導線を出さない", () => {
    render(<SiteFooter />);

    expect(within(screen.getByRole("contentinfo")).queryAllByRole("link")).toHaveLength(0);
  });
});
