import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RootLayout, { metadata } from "./layout";

test("すべてのページに noindex を付ける", () => {
  expect(metadata.robots).toEqual({ index: false });
});

test("ページの題名はクローンのサイト名にする", () => {
  expect(metadata.title).toBe("ヨミカキ");
});

test("すべてのページをヘッダーとフッターで挟む", () => {
  const document = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <main>ページの中身</main>
      </RootLayout>,
    ),
    "text/html",
  );

  expect(document.documentElement.lang).toBe("ja");
  const parts = [...document.body.children].map((element) => element.tagName.toLowerCase());
  expect(parts).toEqual(["header", "main", "footer"]);
  expect(document.querySelector("main")?.textContent).toBe("ページの中身");
});
