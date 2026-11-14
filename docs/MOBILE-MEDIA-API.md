# Mobile API contract — profile media (Flutter lane)

Server-side facts for the avatar/banner upload flow. Everything here is **already deployed
behaviour** — nothing in this document requires a new server change. Bearer token on every
call. Error shape as in `docs/MOBILE-AUTH-API.md`.

This slice opens when the Flutter app reaches the profile/avatar screen; the colour+symbol
avatar picker ships first this release, image upload directly after.

## POST /api/v1/media

One endpoint, three actions, chosen by `action` in the body:

```json
{ "action": "presign", "kind": "avatar", "contentType": "image/png", "sizeBytes": 143202 }
```

### 1. presign

- `kind`: `"avatar"` or `"banner"`.
- `contentType`: whitelist — `image/png`, `image/jpeg`, `image/gif` only.
- `sizeBytes`: 1 byte … 5 MB (`413 too_large` beyond).
- Errors: `415 bad_type`, `413 too_large`, `503 storage_unconfigured` (self-hosted installs
  without storage; show "image uploads unavailable", keep colour+symbol working).
- Returns `{ key, url, contentType, sizeBytes }` — `url` is a presigned PUT, valid **10
  minutes**. The `key` embeds the user id, so it is yours alone.

Upload the bytes with a plain `PUT` to `url` with header `Content-Type: <contentType>`. The
body is the raw file bytes, no multipart. CORS is a browser concept — a Flutter client needs
no origin, so no bucket configuration is required for native.

### 2. confirm

```json
{ "action": "confirm", "kind": "avatar", "key": "u/<userId>/avatar-...png",
  "contentType": "image/png", "sizeBytes": 143202 }
```

- Confirmation is what swaps the image: a presigned PUT alone changes nothing, so an
  abandoned upload never half-lands.
- `403 not_yours` if `key` does not start with `u/<yourId>/` — always use the key the
  presign gave you, never a constructed one.
- `400 upload_missing` if the PUT never landed — the server checks the object exists before
  recording, so a confirm is only honest after a successful PUT. Re-presign and retry.
- `415 bad_type` if `contentType` is outside the png/jpeg/gif whitelist; `400 bad_kind` for a
  missing/invalid `kind`.
- The server records the asset in the ledger and deletes the previous avatar/banner bytes.
- Returns `{ url }` — the app-proxied public URL (see Serving).

### 3. remove

```json
{ "action": "remove", "kind": "avatar" }
```

Clears the pointer (`avatarUrl`/`bannerUrl` → null). The ledger row and old bytes go with
the next confirm that replaces the slot.

## Serving

The bucket is private; objects are served through the app proxy:

```
GET /api/v1/assets/<key>          → the image bytes, long-lived cache headers
```

`publicUrlFor(key)` = `/api/v1/assets/<key>` — a **relative** path. A Flutter client must
prefix it with the same base URL it uses for the API. Never fetch bucket URLs directly; the
presigned PUT url is the only absolute bucket URL a client ever sees.

## Display field

`GET /api/v1/me` carries `avatarUrl` / `bannerUrl` — an app-proxied path or `null`. A null
avatar means "render the colour+symbol fallback"; that picker is the default this release.
