"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { FieldError, FormError } from "@/app/my/works/_components/FieldError/FieldError";
import formStyles from "@/app/my/works/_components/workForm.module.css";
import { updateWork } from "@/lib/api/workMutations";
import type { GenreOption, Work } from "@/lib/api/works";
import { navigateTo } from "@/lib/navigation";
import { CATCHPHRASE_MAX, INTRODUCTION_MAX, RATINGS, type RatingField, SERIAL_STATUS_LABELS, TAG_SLOTS } from "@/lib/works/labels";
import styles from "./WorkSettingsForm.module.css";

type Props = { work: Work; genres: GenreOption[] };

const SERIAL_STATUSES: Work["serial_status"][] = ["running", "completed"];

// Laravel は送ったタグの並びの番号(tags.1 など)でエラーを返す。タグの欄の下にまとめて出す
function tagMessages(errors: Record<string, string[]>): string[] | undefined {
  const messages = Object.entries(errors)
    .filter(([field]) => field === "tags" || field.startsWith("tags."))
    .flatMap(([, list]) => list);
  return messages.length === 0 ? undefined : messages;
}

// すべての項目を送り、送った内容で置き換える(docs/adr/0019)。上限を超えた入力も止めずに送り、Laravel のエラーを出す
export function WorkSettingsForm({ work, genres }: Props) {
  const [serialStatus, setSerialStatus] = useState(work.serial_status);
  const [title, setTitle] = useState(work.title);
  const [genre, setGenre] = useState(work.genre);
  const [catchphrase, setCatchphrase] = useState(work.catchphrase ?? "");
  const [introduction, setIntroduction] = useState(work.introduction ?? "");
  const [ratings, setRatings] = useState<Record<RatingField, boolean>>({
    rating_cruel: work.rating_cruel,
    rating_violent: work.rating_violent,
    rating_sexual: work.rating_sexual,
  });
  const [tags, setTags] = useState(() => Array.from({ length: TAG_SLOTS }, (_, i) => work.tags[i] ?? ""));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const result = await updateWork(work.id, {
      title,
      catchphrase,
      introduction,
      genre,
      tags: tags.map((tag) => tag.trim()).filter((tag) => tag !== ""),
      ...ratings,
      serial_status: serialStatus,
    });
    if (result.ok) {
      navigateTo(`/my/works/${work.id}`);
      return;
    }
    setErrors(result.errors);
    setSaving(false);
  }

  const catchphraseLeft = CATCHPHRASE_MAX - catchphrase.length;
  const introductionOver = introduction.length > INTRODUCTION_MAX;
  const tagErrors = tagMessages(errors);

  return (
    <form className={formStyles.form} aria-label="小説の設定" onSubmit={handleSubmit} noValidate>
      <div className={styles.head}>
        <fieldset className={styles.status}>
          <legend className={styles.hidden}>連載状態</legend>
          {SERIAL_STATUSES.map((status) => (
            <label key={status} className={styles.statusOption}>
              <input
                className={styles.choiceInput}
                type="radio"
                name="serial_status"
                value={status}
                checked={serialStatus === status}
                onChange={() => setSerialStatus(status)}
              />
              <span className={styles.statusLabel}>{SERIAL_STATUS_LABELS[status]}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.titleField}>
          <label className={styles.titleLabel} htmlFor="work-title">
            小説タイトル
          </label>
          <input
            id="work-title"
            className={styles.titleInput}
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

      <section className={styles.group} aria-labelledby="genre-heading">
        <h2 id="genre-heading" className={styles.groupTitle}>
          種類・ジャンル
        </h2>
        <fieldset className={styles.groupBody}>
          <legend className={styles.hidden}>ジャンル</legend>
          <p className={formStyles.help}>当てはまるジャンルを1つ選んでください。</p>
          <div className={styles.choices}>
            {genres.map((option) => (
              <label key={option.value} className={styles.choice}>
                <input
                  className={styles.choiceInput}
                  type="radio"
                  name="genre"
                  value={option.value}
                  checked={genre === option.value}
                  onChange={() => setGenre(option.value)}
                />
                <span className={styles.choiceLabel}>{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError id="work-genre-error" messages={errors.genre} />
        </fieldset>
      </section>

      <section className={styles.group} aria-labelledby="info-heading">
        <h2 id="info-heading" className={styles.groupTitle}>
          小説情報
        </h2>
        <div className={styles.groupBody}>
          <div className={styles.row}>
            <label className={formStyles.label} htmlFor="work-catchphrase">
              キャッチコピー
            </label>
            <div className={formStyles.field}>
              <p className={formStyles.help}>読者の関心を惹くフレーズを入力できます。35文字まで。</p>
              <input
                id="work-catchphrase"
                className={formStyles.input}
                type="text"
                placeholder="例）物語を愛するすべての人たちへ…"
                value={catchphrase}
                aria-invalid={catchphraseLeft < 0 || errors.catchphrase !== undefined}
                aria-describedby="work-catchphrase-error"
                onChange={(event) => setCatchphrase(event.target.value)}
              />
              <p className={`${formStyles.counter} ${catchphraseLeft < 0 ? formStyles.over : ""}`}>残り{catchphraseLeft}文字</p>
              <FieldError id="work-catchphrase-error" messages={errors.catchphrase} />
            </div>
          </div>
          <div className={styles.row}>
            <label className={formStyles.label} htmlFor="work-introduction">
              紹介文
            </label>
            <div className={formStyles.field}>
              <p className={formStyles.help}>あらすじや登場人物の紹介など、小説の情報を入力できます。</p>
              <textarea
                id="work-introduction"
                className={formStyles.textarea}
                placeholder="紹介文を入力…"
                value={introduction}
                aria-invalid={introductionOver || errors.introduction !== undefined}
                aria-describedby="work-introduction-error"
                onChange={(event) => setIntroduction(event.target.value)}
              />
              <p className={`${formStyles.counter} ${introductionOver ? formStyles.over : ""}`}>{introduction.length}文字</p>
              <FieldError id="work-introduction-error" messages={errors.introduction} />
            </div>
          </div>
          <fieldset className={styles.row}>
            <legend className={formStyles.label}>セルフレイティング</legend>
            <div className={formStyles.field}>
              <p className={formStyles.help}>執筆中の小説が以下の内容に該当する場合は選択してください。</p>
              <div className={styles.choices}>
                {RATINGS.map(({ field, label }) => (
                  <label key={field} className={styles.choice}>
                    <input
                      className={styles.choiceInput}
                      type="checkbox"
                      checked={ratings[field]}
                      onChange={(event) => setRatings({ ...ratings, [field]: event.target.checked })}
                    />
                    <span className={styles.choiceLabel}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
          <fieldset className={styles.row} aria-describedby="work-tags-error">
            <legend className={formStyles.label}>タグ</legend>
            <div className={formStyles.field}>
              <p className={formStyles.help}>
                特定の興味や関心を持つ読者に向けて、小説のテーマや特徴を表すキーワードを最大20文字、8つまで設定できます。
              </p>
              <div className={styles.tags}>
                {tags.map((tag, index) => (
                  <input
                    key={index}
                    className={formStyles.input}
                    type="text"
                    aria-label={`タグ${index + 1}`}
                    placeholder={`タグ${index + 1}`}
                    value={tag}
                    onChange={(event) => setTags(tags.map((current, i) => (i === index ? event.target.value : current)))}
                  />
                ))}
              </div>
              <FieldError id="work-tags-error" messages={tagErrors} />
            </div>
          </fieldset>
        </div>
      </section>

      <FormError messages={errors.form} />
      <div className={formStyles.actions}>
        <button className={formStyles.save} type="submit" disabled={saving}>
          変更を保存
        </button>
        <Link className={formStyles.cancel} href={`/my/works/${work.id}`}>
          キャンセル
        </Link>
      </div>
    </form>
  );
}
