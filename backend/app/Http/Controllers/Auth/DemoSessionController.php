<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\StartDemoSession;
use App\Enums\DemoRole;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class DemoSessionController extends Controller
{
    public function store(Request $request, StartDemoSession $startDemoSession): JsonResponse
    {
        $request->validate([
            'role' => ['required', 'string', Rule::enum(DemoRole::class)],
        ]);

        $user = $startDemoSession->handle(DemoRole::from($request->string('role')->toString()));

        return new JsonResponse(['name' => $user->name], 201);
    }
}
