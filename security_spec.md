# Security Specification — VPN Management Platform

## 1. Data Invariants
1. **Admin-Exclusive Write Authority**: Only verified administrators (`isAdmin()`, defined as verified email `zexxybro8@gmail.com` or an existing UID in `/admins/{uid}`) may create, update, or delete `/vpn_servers/{serverId}` or `/admins/{adminUid}` documents.
2. **Strict Schema & Size Enforcement**: Every `/vpn_servers/{serverId}` write must pass `isValidVpnServer(incoming())` checking exact required keys (`hasAll`), no shadow keys (`hasOnly`), string type checks, regex patterns (`countryCode`, `ipAddress`, `ipCode`), and strict byte/length caps (`flagDataUrl.size() <= 120000`, `notes.size() <= 500`, etc.).
3. **Immutable Provenance & Temporal Integrity**: `createdBy` must equal `request.auth.uid` on create and remain immutable on update. `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on both create and update.
4. **Path ID Poisoning Protection**: All single-document operations (`get`, `create`, `update`, `delete`) validate `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars).
5. **PII Isolation on Admin Registry**: `/admins/{adminUid}` contains admin email addresses; `list` is restricted strictly to `isAdmin()`, and `get` is restricted to the matching UID (`request.auth.uid == adminUid`) or `isAdmin()`.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated VPN Creation**: Anonymous client attempts `create` on `/vpn_servers/srv1` -> `PERMISSION_DENIED`.
2. **Non-Admin Signed-In User Creation**: Authenticated standard user (`email_verified: true`, non-admin email) attempts `create` on `/vpn_servers/srv1` -> `PERMISSION_DENIED`.
3. **Unverified Admin Email Spoof**: Authenticated user with `email: "zexxybro8@gmail.com"` and `email_verified: false` attempts `create` on `/vpn_servers/srv1` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Admin attempts `create` on `/vpn_servers/srv1` with extra field `isFeatured: true` -> `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Admin attempts `create` on `/vpn_servers/bad$id..with.chars` -> `PERMISSION_DENIED`.
6. **Denial-of-Wallet Oversized Notes**: Admin attempts `create` with `notes` string of 2,000 characters (`> 500`) -> `PERMISSION_DENIED`.
7. **Invalid Status Injection**: Admin attempts `update` setting `status: "Pending"` (not in `['Active', 'Inactive']`) -> `PERMISSION_DENIED`.
8. **Backdated Timestamp Spoofing**: Admin attempts `create` with client-supplied `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
9. **Immutable Field Tampering**: Admin attempts `update` modifying `createdAt` or `createdBy` -> `PERMISSION_DENIED`.
10. **Non-Admin Status Toggle**: Standard signed-in user attempts `update` changing `status` on `/vpn_servers/srv1` -> `PERMISSION_DENIED`.
11. **PII Scraping on `/admins`**: Non-admin user attempts `list` on `/admins` or `get` on `/admins/otherUid` -> `PERMISSION_DENIED`.
12. **Privilege Self-Escalation**: Non-admin user attempts `create` on `/admins/{ownUid}` to promote themselves -> `PERMISSION_DENIED`.
