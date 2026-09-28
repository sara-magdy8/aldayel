<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        // `role` is the slug; the mutator below turns it into role_id, so callers
        // (and the API payload) keep speaking in 'admin' / 'staff'.
        'role',
        'role_id',
        'is_active',
    ];

    /**
     * `role` stays in the payload as the slug every permission check already
     * compares against; `role_name` carries the Arabic label for display, so the
     * frontend no longer needs a hard-coded translation table.
     */
    protected $appends = ['role', 'role_name'];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        // Eager-loaded to feed the appends below, but the payload already carries
        // everything it holds as `role` / `role_name`.
        'roleRef',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            // When this user last opened the التنبيهات feed — everything sent at
            // or before it counts as read for them. Deliberately absent from
            // $fillable: it is stamped by the feed endpoint alone, and a user
            // payload must never be able to clear somebody's list.
            'notifications_read_at' => 'datetime',
        ];
    }

    // ── role <-> role_id ───────────────────────────────────────
    public function roleRef()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    /**
     * The role's slug — what every authorization check reads.
     *
     * Null when the user has no role row, which fails every check closed: a user
     * whose role could not be resolved is not an admin.
     */
    public function getRoleAttribute(): ?string
    {
        return $this->roleRef?->slug;
    }

    /** The Arabic label (مدير / موظف), for display only. */
    public function getRoleNameAttribute(): ?string
    {
        return $this->roleRef?->name;
    }

    /** Accepts a slug ('admin') or a role id, so both request shapes work. */
    public function setRoleAttribute($value): void
    {
        $this->attributes['role_id'] = Role::idForSlug($value);
        // Drop any stale relation so a re-read reflects what was just set.
        $this->unsetRelation('roleRef');
    }

    /** Convenience for the checks that used to compare the string themselves. */
    public function isAdmin(): bool
    {
        return $this->role === Role::ADMIN;
    }

    /**
     * Who the system mails about office-wide events (the match alerts today).
     *
     * Deactivated admins have lost their access, so they are not told about work
     * they cannot act on, and an admin without an address is silently skipped
     * rather than failing the send for everyone else.
     *
     * @return list<string>
     */
    public static function adminAlertEmails(): array
    {
        return static::whereRelation('roleRef', 'slug', Role::ADMIN)
            ->where('is_active', true)
            ->whereNotNull('email')
            ->pluck('email')
            ->all();
    }
}
