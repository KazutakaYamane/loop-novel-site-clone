<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Sec-Fetch-Site を付けないブラウザ(安全でないオリジン)のために、更新の操作の前にトークンを渡す(docs/adr/0015)
final class CsrfTokenController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return new JsonResponse(['token' => $request->session()->token()]);
    }
}
