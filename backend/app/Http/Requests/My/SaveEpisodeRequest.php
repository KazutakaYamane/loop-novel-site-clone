<?php

declare(strict_types=1);

namespace App\Http\Requests\My;

use Illuminate\Foundation\Http\FormRequest;

// 下書きの保存。本文は空でもよい。上限は docs/adr/0021
class SaveEpisodeRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:100'],
            'body' => ['nullable', 'string', 'max:100000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'title.required' => 'エピソードタイトルを入力してください。',
            'title.string' => 'エピソードタイトルを入力してください。',
            'title.max' => 'エピソードタイトルは:max文字以内で入力してください。',
            'body.required' => '本文が空のエピソードは公開できません。',
            'body.string' => '本文を文字で入力してください。',
            'body.max' => '本文は:max文字以内で入力してください。',
        ];
    }

    public function title(): string
    {
        return $this->string('title')->toString();
    }

    // 空の本文は ConvertEmptyStringsToNull で null になって届くので、空の文字列に戻す
    public function body(): string
    {
        return $this->string('body')->toString();
    }
}
