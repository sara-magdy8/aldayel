@php
    use App\Models\Setting;

    $officeName = Setting::get('office_name', config('app.name'));
    $logo = Setting::get('office_logo');
    $phone = Setting::get('office_phone');
@endphp
{{--
  Shell for every page a paying client sees. Self-contained CSS and no build step:
  these pages are served by Laravel, not the React app, so they cannot reach the
  frontend's stylesheet.
--}}
<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>@yield('title') — {{ $officeName }}</title>
    <style>
        :root {
            --ok: #16a34a;
            --bad: #dc2626;
            --warn: #d97706;
            --ink: #1f2937;
            --muted: #6b7280;
            --line: #e5e7eb;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #f3f4f6;
            color: var(--ink);
            font-family: "Segoe UI", Tahoma, system-ui, sans-serif;
        }
        .card {
            width: 100%;
            max-width: 420px;
            background: #fff;
            border-radius: 16px;
            padding: 32px 24px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, .08);
        }
        .logo { max-height: 56px; margin-bottom: 20px; }
        .badge {
            width: 68px;
            height: 68px;
            margin: 0 auto 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            color: #fff;
        }
        .ok   { background: var(--ok); }
        .bad  { background: var(--bad); }
        .warn { background: var(--warn); }
        h1 { font-size: 20px; margin: 0 0 10px; }
        p  { margin: 0; color: var(--muted); line-height: 1.8; font-size: 15px; }
        .details {
            margin-top: 24px;
            border-top: 1px solid var(--line);
            padding-top: 16px;
            font-size: 14px;
        }
        .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; }
        .row span:first-child { color: var(--muted); }
        .row span:last-child { font-weight: 600; }
        .amount { font-size: 30px; font-weight: 700; margin: 4px 0 24px; }
        .methods { display: grid; gap: 12px; }
        .method {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
            color: inherit;
            font-size: 16px;
            font-weight: 600;
            text-decoration: none;
            transition: border-color .15s, box-shadow .15s;
        }
        .method:hover, .method:focus-visible {
            border-color: var(--ink);
            box-shadow: 0 4px 12px rgba(0, 0, 0, .06);
        }
        /* Points to the start of the line, which is the left edge in this RTL page. */
        .method .chevron { color: var(--muted); font-weight: 400; }
        .contact { margin-top: 20px; font-size: 13px; color: var(--muted); }
        .contact a { color: inherit; }
    </style>
</head>
<body>
    <div class="card">
        @if ($logo)
            <img class="logo" src="{{ asset('storage/' . $logo) }}" alt="{{ $officeName }}">
        @endif

        @yield('content')

        @if ($phone)
            <p class="contact">للاستفسار: <a href="tel:{{ $phone }}">{{ $phone }}</a></p>
        @endif
    </div>
</body>
</html>
