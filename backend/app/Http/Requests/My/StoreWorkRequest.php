<?php

declare(strict_types=1);

namespace App\Http\Requests\My;

use Illuminate\Foundation\Http\FormRequest;

// 作品の作成はタイトルと紹介文だけを受ける(AC-F3-1)。上限は docs/adr/0019
class StoreWorkRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:100'],
            'introduction' => ['nullable', 'string', 'max:10000'],
        ];
    }

    /**
     * 作成と設定で共通の文言
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'title.required' => '小説タイトルを入力してください。',
            'title.string' => '小説タイトルを入力してください。',
            'title.max' => '小説タイトルは:max文字以内で入力してください。',
            'catchphrase.max' => 'キャッチコピーは:max文字以内で入力してください。',
            'introduction.string' => '紹介文を文字で入力してください。',
            'introduction.max' => '紹介文は:max文字以内で入力してください。',
            'tags.max' => 'タグは:maxつまで設定できます。',
            'tags.*.max' => 'タグは1つ:max文字以内で入力してください。',
            'tags.*.distinct' => '同じタグを2回設定できません。',
        ];
    }
}
