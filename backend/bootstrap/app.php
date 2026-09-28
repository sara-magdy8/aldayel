<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Hesabe posts its payment callback/webhook from its own servers and has no
        // session, so it can never carry a CSRF token. The route is protected by the
        // unguessable link token plus the fact that the payload must decrypt with the
        // merchant's secret key — see PaymentLinkController::callback().
        $middleware->validateCsrfTokens(except: [
            'pay/*/callback',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
