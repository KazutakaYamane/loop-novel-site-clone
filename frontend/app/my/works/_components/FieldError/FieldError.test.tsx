import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FieldError, FormError } from "./FieldError";

test("every message for a field is shown", () => {
  render(<FieldError id="title-error" messages={["一つ目。", "二つ目。"]} />);

  expect(document.getElementById("title-error")).toHaveTextContent("一つ目。 二つ目。");
});

test("nothing is shown for a field without messages", () => {
  const { container } = render(<FieldError id="title-error" messages={undefined} />);

  expect(container).toBeEmptyDOMElement();
});

test("every failure of the form is announced", () => {
  render(<FormError messages={["保存できませんでした。", "もう一度お試しください。"]} />);

  expect(screen.getByRole("alert")).toHaveTextContent("保存できませんでした。 もう一度お試しください。");
});

test("nothing is announced without failures", () => {
  render(<FormError messages={undefined} />);

  expect(screen.queryByRole("alert")).toBeNull();
});
