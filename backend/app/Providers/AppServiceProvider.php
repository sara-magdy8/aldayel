<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // سجل العقار — see PropertyLogObserver.
        foreach ([
            \App\Models\Property::class,
            \App\Models\Unit::class,
            \App\Models\RentalContract::class,
            \App\Models\SaleContract::class,
            \App\Models\Collection::class,
            \App\Models\Soum::class,
            \App\Models\PropertyAttachment::class,
        ] as $model) {
            $model::observe(\App\Observers\PropertyLogObserver::class);
        }
    }
}
