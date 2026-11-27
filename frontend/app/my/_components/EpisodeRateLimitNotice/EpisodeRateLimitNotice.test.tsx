import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { EpisodeRateLimitNotice } from "./EpisodeRateLimitNotice";

test("@AC-F4-9 the notice tells the author the limit was reached and when to try again", () => {
  render(<EpisodeRateLimitNotice />);

  expect(screen.getByRole("alert")).toHaveTextContent(
    "エピソードを保存できる回数の上限に達しました。10分ほどおいてからもう一度お試しください。",
  );
});
