<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\LogOut;
use App\Http\Controllers\Controller;
use Illuminate\Http\Response;

final class SessionController extends Controller
{
    public function destroy(LogOut $logOut): Response
    {
        $logOut->handle();

        return new Response(status: 204);
    }
}
