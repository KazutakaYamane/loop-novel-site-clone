import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { Notation } from "./Notation";

function renderNotation(source: string) {
  return render(<p><Notation source={source} /></p>).container.firstElementChild as HTMLElement;
}

function dottedCharacters(element: HTMLElement) {
  return Array.from(element.querySelectorAll("em"), (emphasis) =>
    Array.from(emphasis.children, (character) => character.textContent));
}

test("@AC-F5-10 puts each emphasized character in its own dotted element", () => {
  const element = renderNotation("夜の《《月明かり》》が見える");

  expect(element.textContent).toBe("夜の月明かりが見える");
  expect(dottedCharacters(element)).toEqual([["月", "明", "か", "り"]]);
});

test("@AC-F5-10 keeps empty emphasis as literal notation", () => {
  const element = renderNotation("《《》》");

  expect(element.textContent).toBe("《《》》");
  expect(element.querySelectorAll("em")).toHaveLength(0);
});

test("@AC-F5-15 keeps a surrogate pair and a variation selector with their character", () => {
  const element = renderNotation("《《𠮟葛\u{E0100}》》");

  expect(dottedCharacters(element)).toEqual([["𠮟", "葛\u{E0100}"]]);
});

test("@AC-F5-12 renders ruby inside emphasis as text and ruby outside as ruby", () => {
  const element = renderNotation("《《東京《とうきょう》へ》》と大阪《おおさか》");

  expect(element.textContent).toBe("東京《とうきょう》へと大阪おおさか");
  expect(Array.from(element.querySelectorAll("ruby"), (ruby) => [ruby.firstChild?.textContent, ruby.querySelector("rt")?.textContent]))
    .toEqual([["大阪", "おおさか"]]);
  expect(element.querySelector("em ruby")).toBeNull();
});
