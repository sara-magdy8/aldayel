<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['بيانات الدخول غير صحيحة.'],
            ]);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'الحساب غير نشط.'], 403);
        }

        $token = $user->createToken('api-token')->plainTextToken;

        return response()->json([
            'user'  => $user,
            'token' => $token,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'تم تسجيل الخروج.']);
    }

    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    /**
     * Update the authenticated user's own profile (name, email, and
     * optionally the password). Changing the password requires the
     * current password for confirmation.
     */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name'             => 'required|string|max:255',
            'email'            => 'required|email|unique:users,email,' . $user->id,
            'current_password' => 'nullable|required_with:password',
            'password'         => 'nullable|string|min:8|confirmed',
        ]);

        if (!empty($data['password'])) {
            if (!Hash::check($data['current_password'] ?? '', $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => ['كلمة المرور الحالية غير صحيحة.'],
                ]);
            }
            $user->password = Hash::make($data['password']);
        }

        $user->name  = $data['name'];
        $user->email = $data['email'];
        $user->save();

        return response()->json($user);
    }
}
