# Feature handoff — User profile image

## Summary

Adds a database-backed profile image to the signed-in user identity, with dashboard controls to upload or remove it. The supplied `images.png` is copied to `client/public/profile-placeholder.png` and appears when no stored image is available.

## Branch

`feat/user-profile-image` (not committed or pushed).

## API

- `POST /api/v1/users` accepts the existing JSON request or multipart form data with `employeeNumber` and an optional `profileImage` (PNG, JPEG or WebP, maximum 5 MB). The account and optional image are written in one Oracle transaction.
- `GET /api/v1/auth/me/profile-image` serves only the authenticated user's image.
- `PUT /api/v1/auth/me/profile-image` replaces the current user's image; session authentication and CSRF are required.
- `DELETE /api/v1/auth/me/profile-image` removes it; session authentication and CSRF are required.

The current-user contract provides the same-origin image URL. OpenAPI was updated.

## Database

New table: `XX_ZRV_USER_PROFILE_IMAGES` with `USER_ID` as its primary key and foreign key to `XX_ZRV_USERS.USER_ID`, `IMAGE_BLOB` (BLOB), `MIME_TYPE`, `CREATED_AT`, and `UPDATED_AT`. `XX_ZRV_USERS` remains unchanged. DDL: `server/database-changes/20261031_XX_ZRV_USER_PROFILE_IMAGES.sql`.

The script has **not** been applied. Confirm the deployed Oracle dictionary, table-name availability, and required grants, then apply the DDL to TEST before exercising the API. The live schema and CI3 coexistence were not verified in this workspace.

## Validation

No tests, lint, build, browser, or Oracle checks were run in this implementation pass.

## Known limitations

- The supplied fallback image visibly contains a VectorStock watermark; it is used as requested.
- Provisioning supports an optional image at API level; the dashboard self-service editor is implemented.
