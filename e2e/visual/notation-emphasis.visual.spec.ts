import { expect, test } from "../support/clientAddress";
import { publishNotationEpisode } from "../support/publishNotationEpisode";

test("emphasis dots sit above each character", async ({ page }) => {
  const body = await publishNotationEpisode(page, "《《ここに傍点》》を打ち、青空《あおぞら》の下で《《𠮟咤》》する。");
  const dots = body.locator("em > span");
  await expect(dots).toHaveCount(7);
  await expect(dots.first()).toHaveCSS("background-size", "3px 3px");
  await expect(body).toHaveScreenshot("episode-emphasis.png");
});
