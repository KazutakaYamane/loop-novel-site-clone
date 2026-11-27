<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\Genre;
use Illuminate\Http\JsonResponse;

final class GenreController extends Controller
{
    public function index(): JsonResponse
    {
        return new JsonResponse([
            'data' => array_map(fn (Genre $genre) => ['value' => $genre->value, 'label' => $genre->label()], Genre::cases()),
        ]);
    }
}
