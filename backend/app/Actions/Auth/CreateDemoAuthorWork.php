<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Episodes\PublishEpisode;
use App\Models\User;
use App\Models\Work;

// デモ作者が最初から持つ作品。公開済みの話と下書きの話を 1 つずつ持つ(AC-F2-5)。文章はこのプロジェクトで書いたもの
final readonly class CreateDemoAuthorWork
{
    private const string TITLE = '灯台守の手帖';

    private const string INTRODUCTION = "岬の灯台に、ひとりの新しい灯台守がやってきた。\n前任者が残した手帖には、毎晩の天気と、海から届いた不思議な便りが書き留められていた。";

    private const string FIRST_TITLE = '第1話 岬の灯台';

    private const string FIRST_BODY = "　坂を上りきると、白い灯台が見えた。\n　風は強く、潮の匂いが服の中まで入りこんでくる。鍵を回して扉を開けると、螺旋階段の上から古い紙の匂いが降りてきた。\n\n　机の上に、一冊の手帖が置いてあった。表紙には「引き継ぎ」とだけ書いてある。\n　最初のページを開くと、几帳面な字で、今日の日付と天気が記されていた。";

    private const string SECOND_TITLE = '第2話 最初の便り';

    private const string SECOND_BODY = "　夜になると、灯台の光がゆっくりと海をなでていく。\n　手帖の続きを書こうとして、ペンが止まった。窓の外に、小さな明かりがひとつ、波の上を渡ってくる。";

    public function __construct(private PublishEpisode $publish) {}

    public function handle(User $author): Work
    {
        $work = new Work(['title' => self::TITLE, 'introduction' => self::INTRODUCTION]);
        $work->user()->associate($author);
        $work->save();

        // 公開は作者が画面で公開するときと同じ処理を通す
        $first = $work->episodes()->create(['title' => self::FIRST_TITLE, 'body' => '']);
        $this->publish->handle($first, self::FIRST_TITLE, self::FIRST_BODY);
        $work->episodes()->create(['title' => self::SECOND_TITLE, 'body' => self::SECOND_BODY]);

        return $work;
    }
}
