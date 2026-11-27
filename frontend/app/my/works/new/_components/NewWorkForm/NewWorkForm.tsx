"use client";

import { type FormEvent, useState } from "react";
import { createWork } from "@/lib/api/workMutations";
import { navigateTo } from "@/lib/navigation";
import { FieldError, FormError } from "@/app/my/works/_components/FieldError/FieldError";
import styles from "@/app/my/works/_components/workForm.module.css";

// 作品はタイトルと紹介文だけで作り、ほかの項目は設定の画面で変える(AC-F3-1、docs/kakuyomu-reference/works.md)
export function NewWorkForm() {
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await createWork({ title, introduction });
    if (result.ok) {
      navigateTo(`/my/works/${result.work.id}`);
      return;
    }
    setErrors(result.errors);
    setSaving(false);
  }

  return (
    <form className={styles.form} aria-label="新しい小説" onSubmit={handleSubmit} noValidate>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="work-title">
          小説タイトル
        </label>
        <div className={styles.field}>
          <input
            id="work-title"
            className={styles.input}
            type="text"
            placeholder="小説タイトルを入力…"
            value={title}
            aria-invalid={errors.title !== undefined}
            aria-describedby="work-title-error"
            onChange={(event) => setTitle(event.target.value)}
          />
          <FieldError id="work-title-error" messages={errors.title} />
        </div>
      </div>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="work-introduction">
          紹介文
        </label>
        <div className={styles.field}>
          <p className={styles.help}>あらすじや登場人物の紹介など、小説の情報を入力できます。</p>
          <textarea
            id="work-introduction"
            className={styles.textarea}
            placeholder="紹介文を入力…"
            value={introduction}
            aria-invalid={errors.introduction !== undefined}
            aria-describedby="work-introduction-error"
            onChange={(event) => setIntroduction(event.target.value)}
          />
          <p className={styles.counter}>{introduction.length}文字</p>
          <FieldError id="work-introduction-error" messages={errors.introduction} />
        </div>
      </div>
      <FormError messages={errors.form} />
      <div className={styles.actions}>
        <button className={styles.save} type="submit" disabled={saving}>
          保存
        </button>
      </div>
    </form>
  );
}
