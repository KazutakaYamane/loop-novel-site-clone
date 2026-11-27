"use client";

import { type FormEvent, useState } from "react";
import { createEpisode, publishEpisode, saveEpisode, type EpisodeSaveResult } from "@/lib/api/episodeMutations";
import type { Episode } from "@/lib/api/myEpisodes";
import { navigateTo } from "@/lib/navigation";
import { FieldError, FormError } from "@/app/my/works/_components/FieldError/FieldError";
import styles from "./EpisodeForm.module.css";

type Props = { workId: number; episode?: Episode };

// 話の執筆の画面のフォーム。新しい話は下書きとして作り、続きは作った話の執筆の画面で書く(AC-F4-1、AC-F4-2)。
// 公開はフォームの内容を保存して公開する(AC-F4-6)
export function EpisodeForm({ workId, episode }: Props) {
  const [title, setTitle] = useState(episode?.title ?? "");
  const [body, setBody] = useState(episode?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(send: () => Promise<EpisodeSaveResult>, onSuccess: (saved: Episode) => void) {
    setSending(true);
    setSaved(false);
    const result = await send();
    setSending(false);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSuccess(result.episode);
  }

  function handleSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { title, body };
    if (episode === undefined) {
      void submit(
        () => createEpisode(workId, input),
        (created) => navigateTo(`/my/works/${workId}/episodes/${created.id}/edit`),
      );
      return;
    }
    void submit(
      () => saveEpisode(workId, episode.id, input),
      () => setSaved(true),
    );
  }

  function handlePublish(id: number) {
    void submit(
      () => publishEpisode(workId, id, { title, body }),
      () => navigateTo(`/my/works/${workId}`),
    );
  }

  function edit(update: () => void) {
    update();
    setSaved(false);
  }

  return (
    <form className={styles.form} aria-label="エピソードの執筆" onSubmit={handleSaveDraft} noValidate>
      <div className={styles.toolbar}>
        <p role="status" className={styles.saved}>
          {saved ? "下書きを保存しました。" : ""}
        </p>
        <button className={styles.draft} type="submit" disabled={sending}>
          下書き保存
        </button>
        {episode !== undefined && (
          <button className={styles.publish} type="button" disabled={sending} onClick={() => handlePublish(episode.id)}>
            公開する
          </button>
        )}
      </div>
      <FormError messages={errors.form} />
      <label className={styles.label} htmlFor="episode-title">
        エピソードタイトル
      </label>
      <input
        id="episode-title"
        className={styles.title}
        type="text"
        placeholder="エピソードタイトルを入力…"
        value={title}
        aria-invalid={errors.title !== undefined}
        aria-describedby="episode-title-error"
        onChange={(event) => edit(() => setTitle(event.target.value))}
      />
      <FieldError id="episode-title-error" messages={errors.title} />
      <label className={styles.label} htmlFor="episode-body">
        本文
      </label>
      <textarea
        id="episode-body"
        className={styles.body}
        placeholder="本文を入力…"
        value={body}
        aria-invalid={errors.body !== undefined}
        aria-describedby="episode-body-error"
        onChange={(event) => edit(() => setBody(event.target.value))}
      />
      <p className={styles.counter}>{body.length}文字</p>
      <FieldError id="episode-body-error" messages={errors.body} />
    </form>
  );
}
