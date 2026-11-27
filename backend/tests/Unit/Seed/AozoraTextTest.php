<?php

declare(strict_types=1);

use App\Seed\Aozora\AozoraText;
use App\Seed\Aozora\ConvertedEpisode;

// 青空文庫のテキストファイルの形(タイトル・著者、記号の説明、本文、底本の情報)を短くしたもの
function aozoraSource(string $body, string $header = "蜘蛛の糸\n芥川竜之介"): string
{
    $legend = implode("\r\n", [
        '-------------------------------------------------------',
        '【テキスト中に現れる記号について】',
        '',
        '《》：ルビ',
        '（例）御釈迦様《おしゃかさま》',
        '',
        '［＃］：入力者注　主に外字の説明や、傍点の位置の指定',
        '-------------------------------------------------------',
    ]);
    $colophon = implode("\r\n", [
        '底本：「蜘蛛の糸・杜子春」新潮文庫、新潮社',
        '　　　1968（昭和43）年11月15日発行',
        '入力：蒋龍',
        '校正：noriko saito',
        '2004年3月15日作成',
        '青空文庫作成ファイル：',
        'このファイルは、インターネットの図書館、青空文庫（http://www.aozora.gr.jp/）で作られました。入力、校正、制作にあたったのは、ボランティアの皆さんです。',
    ]);

    return str_replace("\n", "\r\n", $header)."\r\n\r\n".$legend."\r\n\r\n".str_replace("\n", "\r\n", $body)."\r\n\r\n\r\n\r\n".$colophon."\r\n";
}

/** @return list<array{string, string}> */
function episodesOf(string $source): array
{
    return array_map(
        fn (ConvertedEpisode $episode) => [$episode->title, $episode->body],
        (new AozoraText)->convert($source)->episodes,
    );
}

test('the title and author come from the header lines', function () {
    $work = (new AozoraText)->convert(aozoraSource('　本文。', "羅生門 \n副題\n芥川竜之介　 "));

    expect($work->title)->toBe('羅生門')
        ->and($work->author)->toBe('芥川竜之介');
})->group('AC-F8-1');

test('the credit is the colophon from the base text line to the end', function () {
    $work = (new AozoraText)->convert(aozoraSource('　本文。'));

    expect($work->credit)->toBe(implode("\n", [
        '底本：「蜘蛛の糸・杜子春」新潮文庫、新潮社',
        '　　　1968（昭和43）年11月15日発行',
        '入力：蒋龍',
        '校正：noriko saito',
        '2004年3月15日作成',
        '青空文庫作成ファイル：',
        'このファイルは、インターネットの図書館、青空文庫（http://www.aozora.gr.jp/）で作られました。入力、校正、制作にあたったのは、ボランティアの皆さんです。',
    ]));
})->group('AC-F8-2');

test('annotations in the colophon do not appear in the credit', function () {
    $work = (new AozoraText)->convert("題\n著者\n\n本文\n\n底本：「本」［＃「本」は底本では「元」］\n入力：誰か\n");

    expect($work->credit)->toBe("底本：「本」\n入力：誰か");
})->group('AC-F8-2');

test('the body starts right after the closing rule of the legend, and a rule inside a line stays as text', function () {
    $source = "題\n著者\n\n-------------------------------------------------------\n【記号】\n-------------------------------------------------------\n　一行目\n　線は-----------の形\n\n底本：本\n";

    expect(episodesOf($source))->toBe([['題', "　一行目\n　線は-----------の形"]]);
})->group('AC-F8-3');

test('a text without headings becomes one episode titled with the work title, without the legend or the credit', function () {
    expect(episodesOf(aozoraSource("\n　一行目。\n\n　三行目。\n")))->toBe([
        ['蜘蛛の糸', "　一行目。\n\n　三行目。"],
    ]);
})->group('AC-F8-3');

test('aozora ruby is kept as it is, since the F5 notation reads it the same way', function () {
    expect(episodesOf(aozoraSource('御釈迦様《おしゃかさま》は極楽｜蓮池《はすいけ》のふちを')))->toBe([
        ['蜘蛛の糸', '御釈迦様《おしゃかさま》は極楽｜蓮池《はすいけ》のふちを'],
    ]);
})->group('AC-F8-3');

test('annotations do not appear and annotation-only lines are dropped', function () {
    $body = "［＃ここから２字下げ］\n　一行目。［＃「目」は底本では「日」］\n［＃ここで字下げ終わり］\n［＃改ページ］\n　二行目。";

    expect(episodesOf(aozoraSource($body)))->toBe([
        ['蜘蛛の糸', "　一行目。\n　二行目。"],
    ]);
})->group('AC-F8-3');

test('middle and large headings split the text into episodes titled with the heading', function () {
    $body = "［＃８字下げ］一［＃「一」は中見出し］\n\n　始まり。\n\n［＃８字下げ］第二夜［＃「第二夜」は大見出し］\n\n　続き。\n［＃３字下げ］小さな見出し［＃「小さな見出し」は小見出し］";

    expect(episodesOf(aozoraSource($body)))->toBe([
        ['一', '　始まり。'],
        ['第二夜', "　続き。\n小さな見出し"],
    ]);
})->group('AC-F8-3');

test('text before the first heading opens the first episode', function () {
    $body = "　前書き。\n［＃「一」は中見出し］一\n　本文。";

    expect(episodesOf(aozoraSource($body)))->toBe([
        ['一', "　前書き。\n　本文。"],
    ]);
})->group('AC-F8-3');

test('emphasis annotations become F5 emphasis around the preceding text', function () {
    $body = "　それは大切［＃「大切」に傍点］なことだ。白い［＃「白い」に白ゴマ傍点］花。\n［＃傍点］ここ［＃傍点終わり］から。";

    expect(episodesOf(aozoraSource($body)))->toBe([
        ['蜘蛛の糸', "　それは《《大切》》なことだ。《《白い》》花。\n《《ここ》》から。"],
    ]);
})->group('AC-F8-3');

test('an emphasis annotation whose text does not directly precede it is dropped', function () {
    expect(episodesOf(aozoraSource('　大切《たいせつ》［＃「大切」に傍点］なこと。')))->toBe([
        ['蜘蛛の糸', '　大切《たいせつ》なこと。'],
    ]);
})->group('AC-F8-3');

test('external characters with a unicode code point become the character', function () {
    expect(episodesOf(aozoraSource('　※［＃「木＋射」、第3水準1-85-66、U+69B4］の木。')))->toBe([
        ['蜘蛛の糸', '　榴の木。'],
    ]);
})->group('AC-F8-3');

test('external characters with a JIS X 0213 plane, row and cell become the character', function () {
    expect(episodesOf(aozoraSource('　※［＃「特のへん＋廴＋聿」、第3水準1-87-71］陀多と※［＃「にんべん＋參」、第4水準2-1-79］')))->toBe([
        ['蜘蛛の糸', '　犍陀多と傪'],
    ]);
})->group('AC-F8-3');

test('an external character whose JIS X 0213 code is not a character stops the conversion', function () {
    (new AozoraText)->convert(aozoraSource('　※［＃「無い字」、第4水準2-2-1］'));
})->throws(RuntimeException::class, 'JIS X 0213 に無い外字: ※［＃「無い字」、第4水準2-2-1］');

test('an external character outside the 94 rows and cells of JIS X 0213 stops the conversion', function (string $code) {
    (new AozoraText)->convert(aozoraSource("　※［＃「字」、第3水準{$code}］"));
})->with(['1-95-1', '1-1-95'])->throws(RuntimeException::class, 'JIS X 0213 に無い外字');

test('aozora double angle brackets used as text become the F5 escape', function () {
    expect(episodesOf(aozoraSource('　※［＃始め二重山括弧、1-1-52］題※［＃終わり二重山括弧、1-1-53］')))->toBe([
        ['蜘蛛の糸', '　｜《題》'],
    ]);
})->group('AC-F8-3');

test('an external character without a code point stops the conversion', function () {
    (new AozoraText)->convert(aozoraSource('　※［＃「木＋射」］の木。'));
})->throws(RuntimeException::class, '符号位置が無い外字: ※［＃「木＋射」］');

test('a text without a colophon stops the conversion', function () {
    (new AozoraText)->convert("題\n著者\n\n本文");
})->throws(RuntimeException::class, '底本');
