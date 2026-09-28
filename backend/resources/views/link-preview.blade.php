<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>{{ $title }}</title>
    <meta name="description" content="{{ $description }}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="{{ $title }}" />
    <meta property="og:title" content="{{ $title }}" />
    <meta property="og:description" content="{{ $description }}" />
    <meta property="og:url" content="{{ $url }}" />
    @if ($image)
      <meta property="og:image" content="{{ $image }}" />
      {{-- Facebook still reads the https URL from this alias on some clients. --}}
      <meta property="og:image:secure_url" content="{{ $image }}" />
      @if ($image_width && $image_height)
        <meta property="og:image:width" content="{{ $image_width }}" />
        <meta property="og:image:height" content="{{ $image_height }}" />
      @endif
      <meta name="twitter:image" content="{{ $image }}" />
    @endif
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{{ $title }}" />
    <meta name="twitter:description" content="{{ $description }}" />

    {{--
      Only crawlers are routed here, so this redirect normally never runs. It is
      the safety net for a human who reaches this URL on the API domain: send
      them to the real page instead of leaving them on a blank document.
    --}}
    <meta http-equiv="refresh" content="0; url={{ $url }}" />
  </head>
  <body>
    <p><a href="{{ $url }}">{{ $title }}</a></p>
  </body>
</html>
