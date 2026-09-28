<?php

use App\Http\Controllers\LinkPreviewController;
use App\Http\Controllers\PaymentLinkController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Server-rendered og: tags for the public share link. The frontend host rewrites
// /view/* here for crawler user agents (WhatsApp, Telegram, Facebook…) because a
// static SPA cannot vary its preview per link. See docs/link-preview-setup.md.
Route::get('/view/{token}', [LinkPreviewController::class, 'show']);

// Payment links. Public — the token is the credential — and served from Laravel
// rather than the React app because the checkout call has to be signed with the
// merchant's secret key, which must never reach the browser.
Route::get('/pay/{token}', [PaymentLinkController::class, 'show'])->name('payment-link.show');
// One button on the picker page — only reached when the office allowed a subset of
// the payment methods, since Hesabe's own page cannot be told to hide any.
Route::get('/pay/{token}/start/{method}', [PaymentLinkController::class, 'start'])
    ->name('payment-link.start');
Route::match(['get', 'post'], '/pay/{token}/callback', [PaymentLinkController::class, 'callback'])
    ->name('payment-link.callback');
