import { render, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { EpisodeForm } from "./EpisodeForm";

test("server-rendered editing controls are disabled until React hydrates the form", () => {
  const form = (
    <EpisodeForm workId={5} episode={{
      id: 2, work_id: 5, title: "第2話", body: "下書きの本文", status: "draft", published_at: null,
    }} />
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(form);
  const editor = within(container);
  const controls = [
    editor.getByRole("button", { name: "公開する" }),
    editor.getByRole("button", { name: "下書き保存" }),
    editor.getByLabelText("エピソードタイトル"),
    editor.getByLabelText("本文"),
  ];

  for (const control of controls) {
    expect(control).toBeDisabled();
  }

  render(form, { container, hydrate: true });

  for (const control of controls) {
    expect(control).toBeEnabled();
  }
});
