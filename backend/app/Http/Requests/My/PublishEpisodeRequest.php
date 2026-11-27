<?php

declare(strict_types=1);

namespace App\Http\Requests\My;

// 公開は本文が空なら拒む(AC-F4-6)。空白と改行だけの本文も、読める文字が無いので空とみなす
final class PublishEpisodeRequest extends SaveEpisodeRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'body' => ['required', 'string', 'max:100000', 'regex:/[^\s\p{Z}]/u'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'body.regex' => '本文が空のエピソードは公開できません。',
        ];
    }
}
