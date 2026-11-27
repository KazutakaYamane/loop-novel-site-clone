<?php

declare(strict_types=1);

namespace App\Enums;

// カクヨムの作品の設定画面のジャンルの値・表示・並び(docs/kakuyomu-reference/works.md)
enum Genre: string
{
    case Fantasy = 'fantasy';
    case Action = 'action';
    case Sf = 'sf';
    case LoveStory = 'love_story';
    case Romance = 'romance';
    case Drama = 'drama';
    case Horror = 'horror';
    case Mystery = 'mystery';
    case Nonfiction = 'nonfiction';
    case History = 'history';
    case Criticism = 'criticism';
    case Others = 'others';

    public function label(): string
    {
        return match ($this) {
            self::Fantasy => '異世界ファンタジー',
            self::Action => '現代ファンタジー',
            self::Sf => 'SF',
            self::LoveStory => '恋愛',
            self::Romance => 'ラブコメ',
            self::Drama => '現代ドラマ',
            self::Horror => 'ホラー',
            self::Mystery => 'ミステリー',
            self::Nonfiction => 'エッセイ・ノンフィクション',
            self::History => '歴史・時代・伝奇',
            self::Criticism => '創作論・評論',
            self::Others => '詩・童話・その他',
        };
    }
}
