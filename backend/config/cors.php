<?php
// config/cors.php

return [
    'paths'                    => ['api/*'],
    'allowed_methods'          => ['*'],
    'allowed_origins'          => [
        'http://localhost:8080',  // Vite dev server
        'http://localhost:5174',  // Vite dev server
        'http://localhost:3000',
        ],
    'allowed_origins_patterns' => [],
    'allowed_headers'          => ['*'],
    'exposed_headers'          => [],
    'max_age'                  => 0,
    'supports_credentials'     => true,
];
