import { expect, test } from "../support/clientAddress";
import { publishNotationEpisode } from "../support/publishNotationEpisode";

test("ruby sits above its automatic and explicit base text", async ({ page }) => {
  const body = await publishNotationEpisode(page, "青空《あおぞら》の下に、｜まち明かり《まちあかり》が見える。");
  const readings = body.locator("ruby > rt");
  await expect(readings).toHaveText(["あおぞら", "まちあかり"]);
  const baseSize = await body.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  for (const reading of await readings.all()) {
    await expect(reading).toHaveCSS("font-size", `${baseSize / 2}px`);
  }
  await expect(body).toHaveScreenshot("episode-ruby.png");
});
