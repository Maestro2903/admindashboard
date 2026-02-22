# Authentication and Roles

This document describes how authentication and authorization work in the Admin Dashboard: who can access the app, how the server verifies identity, and how roles restrict actions and views.

## Authentication

- **Method:** Firebase Authentication with **Google sign-in** only. Implemented in `features/auth/authService.ts` (`signInWithGoogle()`). Sign-out is via Firebase `signOut`.
- **Client:** The client holds the Firebase User. For every API request that needs auth, it obtains an ID token with `user.getIdToken()` and sends it in the request header:  
  `Authorization: Bearer <idToken>`
- **Server verification:** Protected API routes call `requireOrganizer(req)` (or `requireAdminRole(req)`). That function:
  1. Reads the `Authorization` header and extracts the Bearer token.
  2. Calls Firebase Admin `getAdminAuth().verifyIdToken(idToken)`.
  3. If verification fails (expired, invalid, revoked): returns **401** with a JSON body (e.g. "Session expired. Please sign in again." for expired tokens).
  4. If verification succeeds: continues with the decoded `uid`.

There is no server-side session store; every request is validated using the ID token. Token refresh is handled on the client (e.g. `useMeRole` retries with a fresh token on 401).

## Organizer Check

After a valid token is verified, the server must confirm that the user is an **organizer**:

1. It reads the Firestore document `users/{uid}`.
2. It requires `userDoc.data().isOrganizer === true`.
3. If the user is not an organizer, it returns **403** with body `{ error: "Forbidden: Organizer access required" }`.

So: **only users with `users/{uid}.isOrganizer === true` can access organizer-only and admin routes.** Granting organizer access is done outside this app (e.g. manually in Firestore or via the script `npm run admin:set-superadmin <email>` which sets both organizer and admin role).

## Admin Roles

For routes that need a role (e.g. mutations or financial view), the server uses **requireAdminRole**:

1. It first runs **requireOrganizer** (token + isOrganizer).
2. It reads `users/{uid}.adminRole`.
3. It normalizes the value to one of: **viewer**, **manager**, **superadmin**. If the field is missing or invalid, the default in code is **manager** (see `lib/admin/requireAdminRole.ts`).

Role is then attached to the request context and used to gate actions and visibility.

## Capability Matrix

| Capability | viewer | manager | superadmin |
|------------|--------|---------|-------------|
| Read dashboard, passes, payments, users, teams, events, logs | Yes | Yes | Yes |
| Mutate passes (mark used, revert, soft delete, update-pass, delete pass) | No | Yes | Yes |
| Mutate teams (update-team, bulk team actions) | No | Yes | Yes |
| Mutate users (update-user) | No | No | Yes |
| Mutate payments (update-payment) | No | No | Yes |
| Mutate events (update-event) | No | No | Yes |
| Bulk actions on payments/users/events | No | No | Yes |
| Financial view (amounts, order IDs) | No | No | Yes |

Helper functions in `lib/admin/requireAdminRole.ts`:

- `canMutatePasses(role)` — true for manager, superadmin.
- `canMutateTeams(role)` — true for manager, superadmin.
- `canMutateUsersPaymentsEvents(role)` — true for superadmin only.

Routes that need these capabilities call the helper and, if false, return **403** via `forbiddenRole()`: `{ error: "Forbidden: Insufficient admin role" }`.

## Middleware

The Next.js Edge middleware in `middleware.ts` **does not enforce authentication**. It only applies **rate limiting** to requests matching:

- `/api/admin/:path*`
- `/api/passes/scan`
- `/api/passes/scan-member`

Auth is enforced **inside each route handler** via `requireOrganizer` or `requireAdminRole`. So an unauthenticated request to an admin route will pass the middleware (if under the limit) and then receive 401 from the route.

## Frontend Protection

- **Route guard:** `app/components/AdminPanelShell.tsx` wraps all non-signin pages. It checks `user` and `userData?.isOrganizer`. If not loading and either is falsy, it calls `redirect('/signin')`. So unauthenticated or non-organizer users never see the admin shell.
- **Sign-in page:** `app/AdminLayout.tsx` renders children without the shell when `pathname === '/signin'`, so the sign-in page has no sidebar and is publicly visible.
- **Role in UI:** The shell gets `adminRole` from `useMeRole` (which calls `GET /api/me`) merged with `userData?.adminRole`. The sidebar and pages use this to:
  - Show or hide the **Financial** view (superadmin only).
  - Enable or disable mutation buttons (viewer = read-only; manager = passes/teams; superadmin = all mutations).

Frontend hiding is for UX only; **authorization is enforced in the API**. A viewer cannot call update-pass or update-payment even if they bypass the UI.

## Organizer vs Superadmin (Summary)

- **Organizer:** Any user with `isOrganizer === true`. Can sign in, see the dashboard, list passes/payments/users/teams/events, use live check-in (scan-verify), and trigger fix-stuck-payment. Cannot open the financial view or mutate users/payments/events unless they are also superadmin.
- **Superadmin:** An organizer whose `adminRole === 'superadmin'`. Can do everything a manager can, plus: view the financial view (amounts, order IDs), update users/payments/events, and run bulk actions on payments/users/events.

To grant superadmin: set `users/{uid}.adminRole` to `"superadmin"` in Firestore (or use `npm run admin:set-superadmin <email>` if the script is configured for your project).
