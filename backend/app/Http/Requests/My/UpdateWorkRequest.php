<?php

declare(strict_types=1);

namespace App\Http\Requests\My;

use App\Enums\Genre;
use App\Enums\SerialStatus;
use Illuminate\Validation\Rule;

// 設定の画面はすべての項目を送り、送られた内容で置き換える
final class UpdateWorkRequest extends StoreWorkRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'catchphrase' => ['nullable', 'string', 'max:35'],
            'genre' => ['nullable', Rule::enum(Genre::class)],
            'tags' => ['present', 'array', 'max:8'],
            'tags.*' => ['required', 'string', 'max:20', 'distinct'],
            'rating_cruel' => ['required', 'boolean'],
            'rating_violent' => ['required', 'boolean'],
            'rating_sexual' => ['required', 'boolean'],
            'serial_status' => ['required', Rule::enum(SerialStatus::class)],
        ];
    }

    /**
     * @return list<string>
     */
    public function tagNames(): array
    {
        /** @var list<string> $tags */
        $tags = $this->validated('tags');

        return $tags;
    }

    /**
     * @return array<string, mixed>
     */
    public function settings(): array
    {
        /** @var array<string, mixed> $settings */
        $settings = $this->safe()->except('tags');

        return $settings;
    }
}
