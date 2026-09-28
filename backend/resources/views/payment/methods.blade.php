{{--
  Shown only when the office allowed some payment methods but not all. Hesabe's
  checkout API takes a single paymentType rather than a list, so a genuine subset
  can only be enforced by choosing here and sending that one method's number.
--}}
@extends('payment.layout')

@section('title', 'اختر طريقة الدفع')

@section('content')
    <h1>اختر طريقة الدفع</h1>
    <p>فاتورة رقم {{ $collection->collection_number }}</p>
    <div class="amount">{{ number_format((float) $collection->amount, 3) }} د.ك</div>

    <div class="methods">
        @foreach ($methods as $method)
            <a class="method" href="{{ route('payment-link.start', ['token' => $collection->payment_link_token, 'method' => $method['slug']]) }}">
                <span>{{ $method['label'] }}</span>
                <span class="chevron">‹</span>
            </a>
        @endforeach
    </div>
@endsection
