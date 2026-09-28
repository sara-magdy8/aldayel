<?php

namespace App\Support;

/**
 * AES-256-CBC encrypt/decrypt for the Hesabe checkout API.
 *
 * A verbatim port of the `HesabeCrypt` class from Hesabe's official PHP kit —
 * only the namespace and type hints are ours. The byte handling looks redundant
 * (base64 → bytes → hex) but it is the wire format Hesabe expects, so do not
 * "simplify" it: any change here silently produces payloads the gateway rejects.
 *
 * @see https://developer.hesabe.com/docs/guides/hesabe-indirect-integration/
 */
class HesabeCrypt
{
    /** Encrypt a JSON payload into the hex string the checkout API accepts. */
    public static function encrypt(string $str, string $key, string $ivKey): string
    {
        $str = self::pkcs5Pad($str);
        $encrypted = openssl_encrypt($str, 'AES-256-CBC', $key, OPENSSL_ZERO_PADDING, $ivKey);
        $encrypted = base64_decode($encrypted);
        $encrypted = unpack('C*', $encrypted);
        $encrypted = self::byteArray2Hex($encrypted);

        return urlencode($encrypted);
    }

    /**
     * Decrypt a hex response from the checkout API or the `data` query parameter
     * on the response/failure URL.
     *
     * @return string|false false when the input is not valid hex or the padding
     *                      does not check out — i.e. it was not encrypted with
     *                      these credentials.
     */
    public static function decrypt(string $code, string $key, string $ivKey): string|false
    {
        $code = trim($code);

        if (!(ctype_xdigit($code) && strlen($code) % 2 === 0)) {
            return false;
        }

        $code = self::byteArray2String(self::hex2ByteArray($code));
        $code = base64_encode($code);
        $decrypted = openssl_decrypt($code, 'AES-256-CBC', $key, OPENSSL_ZERO_PADDING, $ivKey);

        if ($decrypted === false || $decrypted === '') {
            return false;
        }

        return self::pkcs5Unpad($decrypted);
    }

    private static function pkcs5Pad(string $text): string
    {
        $blocksize = 32;
        $pad = $blocksize - (strlen($text) % $blocksize);

        return $text . str_repeat(chr($pad), $pad);
    }

    private static function pkcs5Unpad(string $text): string|false
    {
        $pad = ord($text[strlen($text) - 1]);

        if ($pad > strlen($text)) {
            return false;
        }

        if (strspn($text, chr($pad), strlen($text) - $pad) != $pad) {
            return false;
        }

        return substr($text, 0, -1 * $pad);
    }

    private static function byteArray2Hex(array $byteArray): string
    {
        return bin2hex(join(array_map('chr', $byteArray)));
    }

    private static function hex2ByteArray(string $hexString): array
    {
        return unpack('C*', hex2bin($hexString));
    }

    private static function byteArray2String(array $byteArray): string
    {
        return join(array_map('chr', $byteArray));
    }
}
