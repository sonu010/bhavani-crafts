# Runbook: Promote a user to owner / admin

**When to run:** First time after the schema is deployed and the owner has signed up at `/login`.

## Preconditions

- The user has signed up via the `/login` page (email + password).
- A row exists in `auth.users` and `profiles` (via trigger).

## Steps

1. Find the user's profile id:

```sql
SELECT p.id, p.role, p.full_name, u.email
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = '<owner-email>';
```

2. Promote to owner:

```sql
UPDATE profiles SET role = 'owner' WHERE id = '<profile-id-from-above>';
```

3. Verify:

```sql
SELECT id, role, full_name FROM profiles WHERE role IN ('owner', 'admin');
```

Should show the owner.

4. Have the owner sign out and back in (refreshes the session claims) and confirm `/admin` loads.

## Promoting additional admins / editors

Repeat steps 1–3 with `role = 'admin'` or `role = 'editor'`.

## Why this is manual

There is no "make me an admin" button by design. Self-promotion would be a vulnerability. The bootstrap admin is created once via SQL; from then on, admins promote each other via the (future) team-settings UI.
