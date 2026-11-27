<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Actions\Auth\PreviousLoginCookie;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ReportExpiredDemoSession
{
    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $canReport = in_array($response->getStatusCode(), [401, 419], true) || $request->is('api/csrf-token');
        if ($canReport && $request->cookie(PreviousLoginCookie::NAME) === PreviousLoginCookie::VALUE && $request->user() === null) {
            $response->headers->set('X-Demo-Session-Expired', '1');
        }

        return $response;
    }
}
