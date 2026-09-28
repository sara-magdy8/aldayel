<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\PropertyController;
use App\Http\Controllers\Api\UnitController;
use App\Http\Controllers\Api\PropertyRequestController;
use App\Http\Controllers\Api\RentalContractController;
use App\Http\Controllers\Api\SaleContractController;
use App\Http\Controllers\Api\CollectionController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\SoumController;
use App\Http\Controllers\Api\PublicViewController;
use App\Http\Controllers\Api\UserController;

// ── Public (no auth) ───────────────────────────────────────────
Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/public/view/{token}', [PublicViewController::class, 'show']);
Route::get('/public/branding', [SettingController::class, 'publicBranding']);

// ── Protected (Sanctum) ────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me',      [AuthController::class, 'me']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // Users (system admins) — admin-only, guarded in the controller
    Route::apiResource('users', UserController::class);

    // Clients — stats/options must precede the resource routes so they are not
    // swallowed by GET clients/{client}.
    Route::get('clients/stats', [ClientController::class, 'stats']);
    Route::get('clients/options', [ClientController::class, 'options']);
    Route::apiResource('clients', ClientController::class);

    // Properties — next-code/options must precede the resource routes so they
    // are not swallowed by GET properties/{property}.
    Route::get('properties/next-code', [PropertyController::class, 'nextCode']);
    Route::get('properties/options', [PropertyController::class, 'options']);
    Route::get('properties/without-contract', [PropertyController::class, 'withoutContract']);
    Route::apiResource('properties', PropertyController::class);
    Route::post('properties/{property}/toggle-link',   [PropertyController::class, 'toggleLink']);
    Route::post('properties/{property}/link-settings', [PropertyController::class, 'linkSettings']);
    Route::delete('properties/{property}/attachments/{attachment}', [PropertyController::class, 'destroyAttachment']);
    Route::get('properties/{property}/attachments-base64', [PropertyController::class, 'attachmentsBase64']);
    Route::get('properties/{property}/view-data', [PropertyController::class, 'viewData']);
    Route::get('properties/{property}/matching-requests', [PropertyController::class, 'matchingRequests']);
    Route::get('properties/{property}/logs', [PropertyController::class, 'logs']);

    // Units
    Route::get('properties/{property}/units',    [UnitController::class, 'index']);
    Route::post('properties/{property}/units',   [UnitController::class, 'store']);
    Route::get('units/{unit}',                   [UnitController::class, 'show']);
    Route::put('units/{unit}',                   [UnitController::class, 'update']);
    Route::delete('units/{unit}',                [UnitController::class, 'destroy']);
    Route::post('units/{unit}/toggle-link',      [UnitController::class, 'toggleLink']);
    Route::post('units/{unit}/link-settings',    [UnitController::class, 'linkSettings']);
    Route::delete('units/{unit}/images/{image}', [UnitController::class, 'destroyImage']);
    Route::post('units/bulk',                    [UnitController::class, 'bulkCreate']);

    // السوم — bids are listed under one property; a saved bid is then edited
    // or removed by its own id, like units.
    Route::get('properties/{property}/soums',  [SoumController::class, 'index']);
    Route::post('properties/{property}/soums', [SoumController::class, 'store']);
    Route::put('soums/{soum}',                 [SoumController::class, 'update']);
    Route::delete('soums/{soum}',              [SoumController::class, 'destroy']);

    // Requests
    Route::get('requests/{propertyRequest}/matching-properties', [PropertyRequestController::class, 'matchingProperties']);
    Route::apiResource('requests', PropertyRequestController::class)
        ->parameters(['requests' => 'propertyRequest']);

    // Contracts
    Route::get('rental-contracts/stats', [RentalContractController::class, 'stats']);
    Route::apiResource('rental-contracts', RentalContractController::class);
    Route::delete('rental-contracts/{rentalContract}/documents/{document}', [RentalContractController::class, 'destroyDocument']);
    Route::get('sale-contracts/stats', [SaleContractController::class, 'stats']);
    Route::apiResource('sale-contracts',   SaleContractController::class);
    Route::delete('sale-contracts/{saleContract}/documents/{document}', [SaleContractController::class, 'destroyDocument']);

    // Collections
    Route::get('collections/stats', [CollectionController::class, 'stats']);
    Route::apiResource('collections', CollectionController::class);
    Route::post('collections/{collection}/generate-invoice', [CollectionController::class, 'generateInvoice']);
    Route::post('collections/{collection}/send-payment-link', [CollectionController::class, 'sendPaymentLink']);
    Route::post('collections/{collection}/regenerate-payment-link', [CollectionController::class, 'regeneratePaymentLink']);
    Route::delete('collections/{collection}/attachments/{attachment}', [CollectionController::class, 'destroyAttachment']);

    // Reports
    Route::prefix('reports')->group(function () {
        Route::get('summary',     [ReportController::class, 'summary']);
        Route::get('collections', [ReportController::class, 'collections']);
        Route::get('properties',  [ReportController::class, 'properties']);
        Route::get('contracts',   [ReportController::class, 'contracts']);
        Route::get('clients',     [ReportController::class, 'clients']);
    });

    // Settings
    Route::get('/settings',         [SettingController::class, 'index']);
    Route::post('/settings',        [SettingController::class, 'update']);
    Route::post('/settings/logo',    [SettingController::class, 'uploadLogo']);
    Route::post('/settings/favicon', [SettingController::class, 'uploadFavicon']);

    // Notification feed — the mail the alert commands have already sent, read
    // back out of their own ledgers. `seen` is posted by the page on open; there
    // is no per-notification read state to mark.
    Route::get('notifications',              [NotificationController::class, 'index']);
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('notifications/seen',        [NotificationController::class, 'markSeen']);

    // Notification settings (how many rental-contract expiry reminders, and when)
    Route::get('/settings/notifications',  [SettingController::class, 'notifications']);
    Route::post('/settings/notifications', [SettingController::class, 'updateNotifications']);

    // Payment gateways (full-list sync from the settings screen)
    Route::get('/settings/payment-gateways',  [SettingController::class, 'paymentGateways']);
    Route::post('/settings/payment-gateways', [SettingController::class, 'syncPaymentGateways']);

    // Lookups
    Route::prefix('lookups')->group(function () {
        // Credential-free gateway list for pickers (the payment-link form).
        Route::get('payment-gateways',        [SettingController::class, 'paymentGatewayOptions']);
        Route::get('collection-types',        [SettingController::class, 'collectionTypes']);
        Route::get('payment-types',           [SettingController::class, 'paymentTypes']);
        Route::post('payment-types',          [SettingController::class, 'storePaymentType']);
        Route::delete('payment-types/{paymentType}', [SettingController::class, 'destroyPaymentType']);
        Route::get('payment-terms',           [SettingController::class, 'paymentTerms']);
        Route::post('payment-terms',          [SettingController::class, 'storePaymentTerm']);
        Route::delete('payment-terms/{paymentTerm}', [SettingController::class, 'destroyPaymentTerm']);
        Route::get('activities',              [SettingController::class, 'activities']);
        Route::post('activities',             [SettingController::class, 'storeActivity']);
        Route::delete('activities/{activity}', [SettingController::class, 'destroyActivity']);
        Route::get('filmed-by',               [SettingController::class, 'filmedBy']);
        Route::post('filmed-by',              [SettingController::class, 'storeFilmedBy']);
        Route::delete('filmed-by/{filmedBy}', [SettingController::class, 'destroyFilmedBy']);
        Route::get('building-statuses',       [SettingController::class, 'buildingStatuses']);
        Route::post('building-statuses',      [SettingController::class, 'storeBuildingStatus']);
        Route::delete('building-statuses/{buildingStatus}', [SettingController::class, 'destroyBuildingStatus']);
        Route::get('payment-beneficiaries',   [SettingController::class, 'paymentBeneficiaries']);
        Route::get('property-cats',           [SettingController::class, 'propertyCats']);
        Route::post('property-cats',          [SettingController::class, 'storePropertyCat']);
        Route::delete('property-cats/{propertyCat}', [SettingController::class, 'destroyPropertyCat']);
        Route::get('property-statuses',       [SettingController::class, 'propertyStatuses']);
        Route::get('request-statuses',        [SettingController::class, 'requestStatuses']);
        Route::get('contract-statuses',       [SettingController::class, 'contractStatuses']);
        Route::get('roles',                   [SettingController::class, 'roles']);
        Route::get('governorates',            [SettingController::class, 'governorates']);
        Route::get('areas',                   [SettingController::class, 'areas']);
    });
});
