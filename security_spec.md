# Security Specification — IndoXDPro VPN Portal (Pure Firebase Architecture)

## 1. Data Invariants
1. **Admin-Exclusive Configuration Authority**: Only verified administrators (`isAdmin()`, defined as verified email `zexxybro8@gmail.com` or an active existing UID in `/admins/{uid}`) may create, update, or delete `/countries`, `/vpn_servers`, `/ip_codes`, `/redeem_codes` (admin fields), `/admins`, and `/admin_ids` documents, or read/delete `/connection_requests` and private `/vpn_servers` records.
2. **Email/Password Auth & Zero Plaintext Passwords**: Admin login uses Firebase Authentication (`signInWithEmailAndPassword`). Admin IDs are mapped via `/admin_ids/{adminIdKey}` and profiles stored in `/admins/{uid}`. Neither `/admin_ids` nor `/admins` may ever contain password fields (`hasOnly` allowlists strictly forbid them).
3. **Private Code & Admin Directory Protection (Anti-Scraping)**: `/ip_codes`, `/redeem_codes`, and `/admin_ids` strictly deny `allow list` to non-admins (`allow list: if isVerifiedUser() && isAdmin()`). Ordinary clients can only perform exact-ID `get` lookups. `/vpn_servers` denies both `get` and `list` to non-admins so optional `username` and `password` credentials remain private.
4. **Server-Enforced Redemption Integrity**: Ordinary users cannot modify `balance`, `code`, `codeId`, `status`, `expiryDate`, `expiresAt`, `createdBy`, or `createdAt` on `/redeem_codes`. During a VPN connection `runTransaction`, non-admin updates on `/redeem_codes/{codeId}` are restricted strictly to `affectedKeys().hasOnly(['redemptionStatus', 'redeemedAt', 'updatedAt'])` and ONLY when `existing().status == 'Active'`, `existing().redemptionStatus == 'Unused'`, `incoming().redemptionStatus == 'Redeemed'` (terminal lock), `incoming().updatedAt == request.time`, and the expiry timestamp has not passed.
5. **Atomic Transaction Enforcement (`get` + `getAfter`)**: Creating a `'Connected'` log in `/connection_requests/{requestId}` requires Firestore Security Rules to verify atomically that the referenced `/ip_codes/{ipCodeId}` is `'Active'`, the referenced `/redeem_codes/{redeemCodeId}` transitions to `'Redeemed'` via `getAfter(...)`, and `incoming().balance` matches the authoritative database balance.
6. **Path ID Poisoning & Payload Size Guards**: All single-document operations enforce `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `1..128` chars), strict `hasAll`/`hasOnly` key allowlists, explicit types, regex checks, and bounded string sizes.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated VPN Server Creation**: Anonymous client attempts `create` on `/vpn_servers/srv1` -> `PERMISSION_DENIED`.
2. **Public Scraping of Private Codes**: Anonymous or non-admin user attempts `list` on `/redeem_codes`, `/ip_codes`, or `/admin_ids` -> `PERMISSION_DENIED`.
3. **Private VPN Credential Scraping**: Anonymous or non-admin user attempts `get` or `list` on `/vpn_servers` -> `PERMISSION_DENIED`.
4. **Unverified Admin Email Spoof**: Signed-in user with `email: "zexxybro8@gmail.com"` and `email_verified: false` attempts admin write -> `PERMISSION_DENIED`.
5. **Balance Tampering During Redemption**: User attempts `update` on `/redeem_codes/rdm_test` changing `balance` alongside `redemptionStatus` -> `PERMISSION_DENIED`.
6. **Re-activating or Un-redeeming a Used Code**: User attempts `update` on a `'Redeemed'` `/redeem_codes/rdm_test` back to `'Unused'` -> `PERMISSION_DENIED`.
7. **Redeeming an Inactive or Expired Code**: User attempts `update` on an `'Inactive'` or expired `/redeem_codes/rdm_test` -> `PERMISSION_DENIED`.
8. **Fake Connected Audit Log Without Valid IP Code**: User attempts `create` on `/connection_requests/req1` with `resultStatus: "Connected"` and nonexistent or `'Inactive'` `ipCodeId` -> `PERMISSION_DENIED`.
9. **Shadow Field Injection (Including Password Storage)**: Admin or user attempts `create` or `update` adding an unexpected field like `isSuperAdmin: true` or `password: "secret"` -> `PERMISSION_DENIED`.
10. **ID Poisoning Attack**: Client attempts `create` on `/ip_codes/bad$id..chars` or >128-char ID -> `PERMISSION_DENIED`.
11. **Backdated Timestamp Spoofing**: Client attempts `create` or `update` with `createdAt` or `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
12. **Privilege Self-Escalation / Unauthorized Admin ID Mapping**: Non-admin user attempts `list` on `/admins`, `create` on `/admins/{ownUid}`, or `create`/`update` on `/admin_ids/admin551` -> `PERMISSION_DENIED`.
