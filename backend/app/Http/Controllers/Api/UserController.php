<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controllers\HasMiddleware;

class UserController extends Controller implements HasMiddleware
{
    /**
     * Only system admins may manage users.
     * (Laravel 11+ controller middleware — the constructor $this->middleware()
     * helper no longer exists on the bare base controller.)
     */
    public static function middleware(): array
    {
        return [
            function (Request $request, $next) {
                if (! $request->user()->isAdmin()) {
                    return response()->json(['message' => 'غير مصرح لك بإدارة المستخدمين.'], 403);
                }
                return $next($request);
            },
        ];
    }

    public function index(Request $request)
    {
        // roleRef is eager-loaded because every row appends `role` / `role_name`
        // off it — without this the list is a query per user.
        $query = User::query()->with('roleRef');

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                  ->orWhere('email', 'like', "%{$request->search}%");
            });
        }
        // Filtered by slug, the same value the payload carries.
        if ($request->role)   $query->whereHas('roleRef', fn ($q) => $q->where('slug', $request->role));
        if ($request->filled('is_active')) $query->where('is_active', $request->boolean('is_active'));

        // Page size comes from the table's "عرض N سجل" dropdown; capped so a bad
        // `per_page` can't pull the entire table.
        $perPage = is_numeric($request->per_page) ? min(max((int) $request->per_page, 1), 500) : 20;

        return response()->json($query->latest()->paginate($perPage));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'      => 'required|string|max:255',
            'email'     => 'required|email|unique:users,email',
            'password'  => 'required|string|min:8',
            // Validated against the roles table rather than a hard-coded list, so
            // adding a role is a data change and not a code change.
            'role'      => 'required|exists:roles,slug',
            'is_active' => 'sometimes|boolean',
        ]);

        $user = User::create($data);
        return response()->json($user->load('roleRef'), 201);
    }

    public function show(User $user)
    {
        return response()->json($user->load('roleRef'));
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name'      => 'sometimes|string|max:255',
            'email'     => 'sometimes|email|unique:users,email,' . $user->id,
            'password'  => 'nullable|string|min:8',
            'role'      => 'sometimes|exists:roles,slug',
            'is_active' => 'sometimes|boolean',
        ]);

        // Don't overwrite the password with an empty value.
        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update($data);
        return response()->json($user->load('roleRef'));
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'لا يمكنك حذف حسابك الخاص.'], 422);
        }

        if ($user->isAdmin() && User::whereRelation('roleRef', 'slug', Role::ADMIN)->count() <= 1) {
            return response()->json(['message' => 'لا يمكن حذف آخر مدير في النظام.'], 422);
        }

        $user->delete();
        return response()->json(['message' => 'تم الحذف.']);
    }
}
