import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { COUNTRY_OPTIONS } from './src/lib/countries.ts';

dotenv.config();

const PORT = 3000;
const SESSION_COOKIE_NAME = 'indoxdpro_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// --- SQLite Database Initialization ---
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(path.join(dataDir, 'indoxdpro.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_credentials (
    admin_id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS countries (
    id TEXT PRIMARY KEY,
    country_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    keywords TEXT NOT NULL DEFAULT '',
    flag_mode TEXT NOT NULL DEFAULT 'preset',
    flag_data_url TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vpn_entries (
    id TEXT PRIMARY KEY,
    country_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    flag_mode TEXT NOT NULL DEFAULT 'preset',
    flag_data_url TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL,
    ip_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS redeem_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    balance REAL NOT NULL DEFAULT 0,
    expiry_date TEXT NOT NULL DEFAULT '',
    redemption_status TEXT NOT NULL DEFAULT 'Unused',
    redeemed_at TEXT NOT NULL DEFAULT '',
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ip_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS connection_requests (
    id TEXT PRIMARY KEY,
    country_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    redeem_code TEXT NOT NULL,
    ip_code TEXT NOT NULL,
    result_status TEXT NOT NULL,
    status_reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Safe schema migration for existing databases
function migrateRedeemCodesTable() {
  const cols = db.prepare('PRAGMA table_info(redeem_codes)').all() as Array<{ name: string }>;
  const existingCols = new Set(cols.map((c) => c.name));
  if (!existingCols.has('balance')) {
    db.exec('ALTER TABLE redeem_codes ADD COLUMN balance REAL NOT NULL DEFAULT 0;');
  }
  if (!existingCols.has('expiry_date')) {
    db.exec("ALTER TABLE redeem_codes ADD COLUMN expiry_date TEXT NOT NULL DEFAULT '';");
  }
  if (!existingCols.has('redemption_status')) {
    db.exec("ALTER TABLE redeem_codes ADD COLUMN redemption_status TEXT NOT NULL DEFAULT 'Unused';");
  }
  if (!existingCols.has('redeemed_at')) {
    db.exec("ALTER TABLE redeem_codes ADD COLUMN redeemed_at TEXT NOT NULL DEFAULT '';");
  }
}

migrateRedeemCodesTable();

// --- Password Hashing (scrypt + random salt + timingSafeEqual) ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, derivedBuf);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// Bootstrap initial admin credential if table is empty (stored strictly as salted scrypt hash)
function bootstrapAdminCredentials() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM admin_credentials').get() as { count: number };
  if (row.count === 0) {
    const initialId = (process.env.ADMIN_ID || 'ADMIN551').trim();
    const initialPassword = process.env.ADMIN_PASSWORD || 'ADMIN551';
    const hashed = hashPassword(initialPassword);
    db.prepare(
      'INSERT INTO admin_credentials (admin_id, password_hash, created_at) VALUES (?, ?, ?)'
    ).run(initialId, hashed, new Date().toISOString());
  }
}

// Seed initial countries list (country names & ISO flags only — zero fake IPs/servers)
function seedCountriesIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM countries').get() as { count: number };
  if (row.count === 0) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO countries (
        id, country_name, country_code, keywords, flag_mode, flag_data_url, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'preset', '', 1, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      for (const c of COUNTRY_OPTIONS) {
        stmt.run(`cty_${c.code.toLowerCase()}`, c.name, c.code, c.keywords ?? '', now, now);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

bootstrapAdminCredentials();
seedCountriesIfEmpty();

// --- Validation Helpers ---
function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':') || !/^[0-9a-fA-F:]+$/.test(value)) return false;
  const doubleColons = value.split('::');
  if (doubleColons.length > 2) return false;
  const groups = value.split(':').filter((g) => g.length > 0);
  if (doubleColons.length === 1 && groups.length !== 8) return false;
  if (doubleColons.length === 2 && groups.length > 7) return false;
  return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g));
}

function isValidIpOrHost(value: string, strictIpOnly: boolean): boolean {
  if (!value || value.length < 3 || value.length > 64) return false;
  if (isValidIpv4(value) || isValidIpv6(value)) return true;
  if (strictIpOnly) return false;
  return /^(?=.{3,64}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    value
  );
}

const IP_CODE_REGEX = /^[a-zA-Z0-9_.:/-]{1,64}$/;
const REDEEM_CODE_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EXPIRY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE_REGEX = /^([A-Z]{2}(-[A-Z]{2,3})?)?$/;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidExpiryDate(value: string): boolean {
  if (!value) return true;
  if (!EXPIRY_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isRedeemExpired(expiryDate: string): boolean {
  if (!expiryDate) return false;
  return expiryDate < getTodayIsoDate();
}

function parseRedeemBalance(raw: unknown): { valid: boolean; value: number } {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: false, value: 0 };
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > 10000000) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: Math.round(num * 100) / 100 };
}

// --- Session Cookie & Bearer Middleware ---
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

interface AuthenticatedRequest extends Request {
  adminId?: string;
  sessionToken?: string;
}

function requireAdminAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: 'Administrator authentication required.' });
    return;
  }

  const tokenHash = hashToken(token);
  const now = Date.now();
  const session = db
    .prepare('SELECT admin_id, expires_at FROM admin_sessions WHERE token_hash = ?')
    .get(tokenHash) as { admin_id: string; expires_at: number } | undefined;

  if (!session || session.expires_at < now) {
    if (session) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
    }
    res.status(401).json({ ok: false, error: 'Admin session expired or invalid.' });
    return;
  }

  req.adminId = session.admin_id;
  req.sessionToken = token;
  next();
}

// --- Express App Setup ---
const app = express();
app.use(express.json({ limit: '512kb' }));

// --- Public Portal Endpoints ---
app.get('/api/portal/countries', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT id, country_name, country_code, keywords, flag_mode, flag_data_url
       FROM countries
       WHERE is_active = 1
       ORDER BY country_name ASC`
    )
    .all() as Array<{
    id: string;
    country_name: string;
    country_code: string;
    keywords: string;
    flag_mode: string;
    flag_data_url: string;
  }>;

  res.json({
    ok: true,
    countries: rows.map((r) => ({
      id: r.id,
      name: r.country_name,
      code: r.country_code,
      keywords: r.keywords || undefined,
      flagMode: r.flag_mode === 'upload' ? 'upload' : 'preset',
      flagDataUrl: r.flag_data_url || '',
    })),
  });
});

interface RedeemCodeRow {
  id: string;
  code: string;
  label: string;
  balance: number;
  expiry_date: string;
  redemption_status: string;
  redeemed_at: string;
  max_uses: number;
  used_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

app.post('/api/portal/verify-redeem', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawCode = String(body.code ?? '').trim();

  if (!rawCode || !REDEEM_CODE_REGEX.test(rawCode)) {
    res.status(400).json({
      ok: false,
      valid: false,
      error: 'INVALID REDEEM CODE',
      reason: 'Enter a valid redeem code (2–64 characters).',
    });
    return;
  }

  const row = db
    .prepare('SELECT * FROM redeem_codes WHERE LOWER(code) = LOWER(?)')
    .get(rawCode) as RedeemCodeRow | undefined;

  if (!row) {
    res.status(404).json({
      ok: false,
      valid: false,
      error: 'INVALID REDEEM CODE',
      reason: 'This redeem code does not exist.',
    });
    return;
  }

  if (row.status !== 'Active') {
    res.status(403).json({
      ok: false,
      valid: false,
      error: 'INVALID REDEEM CODE',
      reason: 'This redeem code is currently inactive.',
    });
    return;
  }

  if (isRedeemExpired(row.expiry_date)) {
    res.status(403).json({
      ok: false,
      valid: false,
      error: 'INVALID REDEEM CODE',
      reason: `This redeem code expired on ${row.expiry_date}.`,
    });
    return;
  }

  if (row.redemption_status === 'Redeemed') {
    res.status(409).json({
      ok: false,
      valid: false,
      error: 'INVALID REDEEM CODE',
      reason: 'This redeem code has already been redeemed.',
    });
    return;
  }

  res.json({
    ok: true,
    valid: true,
    code: row.code,
    balance: Number(row.balance ?? 0),
    status: row.status,
    expiryDate: row.expiry_date || '',
    redemptionStatus: row.redemption_status === 'Redeemed' ? 'Redeemed' : 'Unused',
  });
});

interface IpCodeRow {
  id: string;
  code: string;
  label: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function checkAuthoritativeIpCode(rawIpCode: string): {
  valid: boolean;
  canonicalCode?: string;
  reason?: string;
} {
  const row = db
    .prepare('SELECT id, code, status FROM ip_codes WHERE LOWER(code) = LOWER(?)')
    .get(rawIpCode) as { id: string; code: string; status: string } | undefined;

  if (row) {
    if (row.status !== 'Active') {
      return { valid: false, reason: 'This IP Code is currently inactive.' };
    }
    return { valid: true, canonicalCode: row.code };
  }

  // Fallback: check if an active admin-created VPN entry explicitly owns this IP Code
  const vpnRows = db
    .prepare('SELECT ip_code, status FROM vpn_entries WHERE LOWER(ip_code) = LOWER(?)')
    .all(rawIpCode) as Array<{ ip_code: string; status: string }>;

  if (vpnRows.length > 0) {
    const activeVpn = vpnRows.find((v) => v.status === 'Active');
    if (activeVpn) {
      return { valid: true, canonicalCode: activeVpn.ip_code };
    }
    return { valid: false, reason: 'This IP Code is currently inactive.' };
  }

  return { valid: false, reason: 'IP Code is not registered by administrator.' };
}

app.post('/api/portal/verify-ip-code', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawCode = String(body.code ?? '').trim();

  if (!rawCode || !IP_CODE_REGEX.test(rawCode)) {
    res.status(400).json({
      ok: false,
      valid: false,
      error: 'Not Verified',
      reason: 'Enter a valid IP Code format.',
    });
    return;
  }

  const check = checkAuthoritativeIpCode(rawCode);
  if (!check.valid) {
    res.status(403).json({
      ok: false,
      valid: false,
      error: 'Not Verified',
      reason: check.reason || 'Invalid or inactive IP Code.',
    });
    return;
  }

  res.json({
    ok: true,
    valid: true,
    code: check.canonicalCode ?? rawCode,
    status: 'Active',
  });
});

app.post('/api/portal/connect', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const countryName = String(body.countryName ?? '').trim();
  const countryCode = String(body.countryCode ?? '').trim().toUpperCase();
  const ipAddress = String(body.ipAddress ?? '').trim();
  const redeemCode = String(body.redeemCode ?? '').trim();
  const ipCode = String(body.ipCode ?? '').trim();

  if (!countryName || !countryCode) {
    res.status(400).json({ ok: false, error: 'Please select a country.' });
    return;
  }

  if (!isValidIpOrHost(ipAddress, true)) {
    res.status(400).json({ ok: false, error: 'Enter a valid IPv4 or IPv6 address.' });
    return;
  }

  if (!REDEEM_CODE_REGEX.test(redeemCode)) {
    res.status(400).json({
      ok: false,
      error: 'INVALID REDEEM CODE',
    });
    return;
  }

  if (!IP_CODE_REGEX.test(ipCode)) {
    res.status(400).json({
      ok: false,
      error: 'IP Code must be 1–64 characters using letters, numbers, or . _ : / -',
    });
    return;
  }

  const now = new Date().toISOString();
  const logConnection = (resultStatus: 'Connected' | 'Rejected', reason: string) => {
    db.prepare(
      `INSERT INTO connection_requests (
        id, country_name, country_code, ip_address, redeem_code, ip_code, result_status, status_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      generateId('req'),
      countryName,
      countryCode,
      ipAddress,
      redeemCode,
      ipCode,
      resultStatus,
      reason,
      now
    );
  };

  // Atomic transaction prevents race conditions & duplicate one-time redemptions
  let inTransaction = false;
  try {
    db.exec('BEGIN IMMEDIATE;');
    inTransaction = true;

    // 1. Check if country is disabled by admin
    const countryRow = db
      .prepare('SELECT is_active FROM countries WHERE LOWER(country_code) = LOWER(?)')
      .get(countryCode) as { is_active: number } | undefined;

    if (countryRow && countryRow.is_active !== 1) {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = `${countryName} is currently disabled by administrator.`;
      logConnection('Rejected', reason);
      res.status(403).json({ ok: false, error: reason });
      return;
    }

    // 2. Check registered VPN entries if matching IP exists
    const vpnRow = db
      .prepare('SELECT country_name, ip_code, status FROM vpn_entries WHERE LOWER(ip_address) = LOWER(?)')
      .get(ipAddress) as { country_name: string; ip_code: string; status: string } | undefined;

    if (vpnRow) {
      if (vpnRow.status !== 'Active') {
        db.exec('ROLLBACK;');
        inTransaction = false;
        const reason = `Endpoint ${ipAddress} (${vpnRow.country_name}) is currently Inactive.`;
        logConnection('Rejected', reason);
        res.status(403).json({ ok: false, error: reason });
        return;
      }
      if (vpnRow.ip_code.toLowerCase() !== ipCode.toLowerCase()) {
        db.exec('ROLLBACK;');
        inTransaction = false;
        const reason = 'IP Code does not match the registered server endpoint.';
        logConnection('Rejected', reason);
        res.status(403).json({ ok: false, error: reason });
        return;
      }
    }

    // 3. Authoritative backend IP Code verification (only admin-created active IP Codes accepted)
    const ipCodeCheck = checkAuthoritativeIpCode(ipCode);
    if (!ipCodeCheck.valid) {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = ipCodeCheck.reason || 'Invalid or inactive IP Code.';
      logConnection('Rejected', reason);
      res.status(403).json({ ok: false, error: reason });
      return;
    }

    // 4. Authoritative backend Redeem Code verification (only admin-created codes accepted)
    const redeemRow = db
      .prepare('SELECT * FROM redeem_codes WHERE LOWER(code) = LOWER(?)')
      .get(redeemCode) as RedeemCodeRow | undefined;

    if (!redeemRow) {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = 'INVALID REDEEM CODE';
      logConnection('Rejected', reason);
      res.status(403).json({ ok: false, error: reason });
      return;
    }

    if (redeemRow.status !== 'Active') {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = 'INVALID REDEEM CODE — This redeem code is inactive.';
      logConnection('Rejected', reason);
      res.status(403).json({ ok: false, error: reason });
      return;
    }

    if (isRedeemExpired(redeemRow.expiry_date)) {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = `INVALID REDEEM CODE — Expired on ${redeemRow.expiry_date}.`;
      logConnection('Rejected', reason);
      res.status(403).json({ ok: false, error: reason });
      return;
    }

    if (redeemRow.redemption_status === 'Redeemed') {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = 'This redeem code has already been redeemed.';
      logConnection('Rejected', reason);
      res.status(409).json({ ok: false, error: reason });
      return;
    }

    // 4. Atomic conditional one-time redemption update inside BEGIN IMMEDIATE
    const updateRes = db
      .prepare(
        `UPDATE redeem_codes
         SET redemption_status = 'Redeemed',
             used_count = used_count + 1,
             redeemed_at = ?,
             updated_at = ?
         WHERE id = ?
           AND redemption_status = 'Unused'
           AND status = 'Active'`
      )
      .run(now, now, redeemRow.id);

    if (updateRes.changes !== 1) {
      db.exec('ROLLBACK;');
      inTransaction = false;
      const reason = 'This redeem code has already been redeemed.';
      logConnection('Rejected', reason);
      res.status(409).json({ ok: false, error: reason });
      return;
    }

    const authoritativeBalance = Number(redeemRow.balance ?? 0);
    logConnection('Connected', `Verified endpoint & redeemed ₹${authoritativeBalance}`);
    db.exec('COMMIT;');
    inTransaction = false;

    res.json({
      ok: true,
      connection: {
        countryName,
        countryCode,
        ipAddress,
        redeemCode: redeemRow.code,
        ipCode,
        balance: authoritativeBalance,
        connectedAt: now,
      },
    });
  } catch (err) {
    if (inTransaction) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback cleanup error
      }
    }
    const message = err instanceof Error ? err.message : 'Unable to process redemption.';
    res.status(500).json({ ok: false, error: message });
  }
});

// --- Admin Authentication Endpoints ---
app.post('/api/admin/login', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const adminId = String(body.adminId ?? '').trim();
  const password = String(body.password ?? '');

  if (!adminId || !password) {
    res.status(400).json({ ok: false, error: 'Admin ID and Password are required.' });
    return;
  }

  const cred = db
    .prepare('SELECT admin_id, password_hash FROM admin_credentials WHERE admin_id = ?')
    .get(adminId) as { admin_id: string; password_hash: string } | undefined;

  if (!cred || !verifyPassword(password, cred.password_hash)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    res.status(401).json({ ok: false, error: 'Invalid Admin ID or Password.' });
    return;
  }

  // Purge expired sessions
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, cred.admin_id, expiresAt, new Date().toISOString());

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}`
  );

  res.json({
    ok: true,
    adminId: cred.admin_id,
    token: rawToken,
    expiresAt,
  });
});

app.get('/api/admin/session', requireAdminAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, authenticated: true, adminId: req.adminId });
});

app.post('/api/admin/logout', (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  if (token) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token));
  }
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`
  );
  res.json({ ok: true });
});

// --- Protected Admin Routes: Countries ---
app.get('/api/admin/countries', requireAdminAuth, (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM countries ORDER BY country_name ASC')
    .all() as Array<{
    id: string;
    country_name: string;
    country_code: string;
    keywords: string;
    flag_mode: string;
    flag_data_url: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  res.json({
    ok: true,
    countries: rows.map((r) => ({
      id: r.id,
      name: r.country_name,
      code: r.country_code,
      keywords: r.keywords,
      flagMode: r.flag_mode === 'upload' ? 'upload' : 'preset',
      flagDataUrl: r.flag_data_url,
      isActive: r.is_active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/admin/countries', requireAdminAuth, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const flagMode = body.flagMode === 'upload' ? 'upload' : 'preset';
  const code = flagMode === 'preset' ? String(body.code ?? '').trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? String(body.flagDataUrl ?? '').trim() : '';
  const keywords = String(body.keywords ?? '').trim().slice(0, 120);
  const isActive = body.isActive === false ? 0 : 1;

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ ok: false, error: 'Country name must be 2–80 characters.' });
    return;
  }
  if (flagMode === 'preset' && (!code || !COUNTRY_CODE_REGEX.test(code))) {
    res.status(400).json({ ok: false, error: 'Please provide a valid 2-letter ISO country code.' });
    return;
  }
  if (
    flagMode === 'upload' &&
    (!flagDataUrl || flagDataUrl.length > 120000 || !DATA_URL_REGEX.test(flagDataUrl))
  ) {
    res.status(400).json({ ok: false, error: 'Uploaded flag image must be a valid image under 90 KB.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('cty');
  db.prepare(
    `INSERT INTO countries (
      id, country_name, country_code, keywords, flag_mode, flag_data_url, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, code, keywords, flagMode, flagDataUrl, isActive, now, now);

  res.status(201).json({ ok: true, id });
});

app.put('/api/admin/countries/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM countries WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Country not found.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const flagMode = body.flagMode === 'upload' ? 'upload' : 'preset';
  const code = flagMode === 'preset' ? String(body.code ?? '').trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? String(body.flagDataUrl ?? '').trim() : '';
  const keywords = String(body.keywords ?? '').trim().slice(0, 120);
  const isActive = body.isActive === false ? 0 : 1;

  if (name.length < 2 || name.length > 80) {
    res.status(400).json({ ok: false, error: 'Country name must be 2–80 characters.' });
    return;
  }
  if (flagMode === 'preset' && (!code || !COUNTRY_CODE_REGEX.test(code))) {
    res.status(400).json({ ok: false, error: 'Please provide a valid 2-letter ISO country code.' });
    return;
  }
  if (
    flagMode === 'upload' &&
    (!flagDataUrl || flagDataUrl.length > 120000 || !DATA_URL_REGEX.test(flagDataUrl))
  ) {
    res.status(400).json({ ok: false, error: 'Uploaded flag image must be a valid image under 90 KB.' });
    return;
  }

  db.prepare(
    `UPDATE countries
     SET country_name = ?, country_code = ?, keywords = ?, flag_mode = ?, flag_data_url = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(name, code, keywords, flagMode, flagDataUrl, isActive, new Date().toISOString(), id);

  res.json({ ok: true });
});

app.delete('/api/admin/countries/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM countries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: 'Country not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- Protected Admin Routes: VPN Entries (IP Addresses & IP Codes) ---
app.get('/api/admin/vpn-entries', requireAdminAuth, (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM vpn_entries ORDER BY country_name ASC, created_at DESC')
    .all() as Array<{
    id: string;
    country_name: string;
    country_code: string;
    flag_mode: string;
    flag_data_url: string;
    ip_address: string;
    ip_code: string;
    status: string;
    username: string;
    password: string;
    notes: string;
    created_at: string;
    updated_at: string;
  }>;

  res.json({
    ok: true,
    entries: rows.map((r) => ({
      id: r.id,
      countryName: r.country_name,
      countryCode: r.country_code,
      flagMode: r.flag_mode === 'upload' ? 'upload' : 'preset',
      flagDataUrl: r.flag_data_url,
      ipAddress: r.ip_address,
      ipCode: r.ip_code,
      status: r.status === 'Inactive' ? 'Inactive' : 'Active',
      username: r.username,
      password: r.password,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/admin/vpn-entries', requireAdminAuth, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const countryName = String(body.countryName ?? '').trim();
  const flagMode = body.flagMode === 'upload' ? 'upload' : 'preset';
  const countryCode = flagMode === 'preset' ? String(body.countryCode ?? '').trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? String(body.flagDataUrl ?? '').trim() : '';
  const ipAddress = String(body.ipAddress ?? '').trim();
  const ipCode = String(body.ipCode ?? '').trim();
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  const username = String(body.username ?? '').trim().slice(0, 100);
  const password = String(body.password ?? '').slice(0, 100);
  const notes = String(body.notes ?? '').trim().slice(0, 500);

  if (countryName.length < 2 || countryName.length > 80) {
    res.status(400).json({ ok: false, error: 'Country name must be 2–80 characters.' });
    return;
  }
  if (flagMode === 'preset' && (!countryCode || !COUNTRY_CODE_REGEX.test(countryCode))) {
    res.status(400).json({ ok: false, error: 'Select a valid country flag.' });
    return;
  }
  if (
    flagMode === 'upload' &&
    (!flagDataUrl || flagDataUrl.length > 120000 || !DATA_URL_REGEX.test(flagDataUrl))
  ) {
    res.status(400).json({ ok: false, error: 'Invalid uploaded flag image.' });
    return;
  }
  if (!isValidIpOrHost(ipAddress, false)) {
    res.status(400).json({ ok: false, error: 'Enter a valid IPv4, IPv6, or server hostname.' });
    return;
  }
  if (!IP_CODE_REGEX.test(ipCode)) {
    res.status(400).json({ ok: false, error: 'IP Code must be 1–64 valid characters.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('vpn');
  db.prepare(
    `INSERT INTO vpn_entries (
      id, country_name, country_code, flag_mode, flag_data_url, ip_address, ip_code, status, username, password, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    countryName,
    countryCode,
    flagMode,
    flagDataUrl,
    ipAddress,
    ipCode,
    status,
    username,
    password,
    notes,
    now,
    now
  );

  res.status(201).json({ ok: true, id });
});

app.put('/api/admin/vpn-entries/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM vpn_entries WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ ok: false, error: 'VPN entry not found.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const countryName = String(body.countryName ?? '').trim();
  const flagMode = body.flagMode === 'upload' ? 'upload' : 'preset';
  const countryCode = flagMode === 'preset' ? String(body.countryCode ?? '').trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? String(body.flagDataUrl ?? '').trim() : '';
  const ipAddress = String(body.ipAddress ?? '').trim();
  const ipCode = String(body.ipCode ?? '').trim();
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  const username = String(body.username ?? '').trim().slice(0, 100);
  const password = String(body.password ?? '').slice(0, 100);
  const notes = String(body.notes ?? '').trim().slice(0, 500);

  if (countryName.length < 2 || countryName.length > 80) {
    res.status(400).json({ ok: false, error: 'Country name must be 2–80 characters.' });
    return;
  }
  if (!isValidIpOrHost(ipAddress, false)) {
    res.status(400).json({ ok: false, error: 'Enter a valid IPv4, IPv6, or server hostname.' });
    return;
  }
  if (!IP_CODE_REGEX.test(ipCode)) {
    res.status(400).json({ ok: false, error: 'IP Code must be 1–64 valid characters.' });
    return;
  }

  db.prepare(
    `UPDATE vpn_entries
     SET country_name = ?, country_code = ?, flag_mode = ?, flag_data_url = ?, ip_address = ?, ip_code = ?, status = ?, username = ?, password = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    countryName,
    countryCode,
    flagMode,
    flagDataUrl,
    ipAddress,
    ipCode,
    status,
    username,
    password,
    notes,
    new Date().toISOString(),
    id
  );

  res.json({ ok: true });
});

app.patch('/api/admin/vpn-entries/:id/status', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const row = db.prepare('SELECT status FROM vpn_entries WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ ok: false, error: 'VPN entry not found.' });
    return;
  }
  const nextStatus = row.status === 'Active' ? 'Inactive' : 'Active';
  db.prepare('UPDATE vpn_entries SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    new Date().toISOString(),
    id
  );
  res.json({ ok: true, status: nextStatus });
});

app.delete('/api/admin/vpn-entries/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM vpn_entries WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: 'VPN entry not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- Protected Admin Routes: Redeem Codes ---
app.get('/api/admin/redeem-codes', requireAdminAuth, (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM redeem_codes ORDER BY created_at DESC')
    .all() as unknown as RedeemCodeRow[];

  res.json({
    ok: true,
    redeemCodes: rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      balance: Number(r.balance ?? 0),
      expiryDate: r.expiry_date || '',
      redemptionStatus: r.redemption_status === 'Redeemed' ? 'Redeemed' : 'Unused',
      redeemedAt: r.redeemed_at || '',
      maxUses: r.max_uses,
      usedCount: r.used_count,
      status: r.status === 'Inactive' ? 'Inactive' : 'Active',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/admin/redeem-codes', requireAdminAuth, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 100);
  const parsedBalance = parseRedeemBalance(body.balance);
  const expiryDate = String(body.expiryDate ?? '').trim();
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!REDEEM_CODE_REGEX.test(code)) {
    res.status(400).json({
      ok: false,
      error: 'Redeem Code must be 2–64 chars using letters, numbers, - or _.',
    });
    return;
  }

  if (!parsedBalance.valid) {
    res.status(400).json({
      ok: false,
      error: 'Balance must be a valid non-negative amount (₹).',
    });
    return;
  }

  if (!isValidExpiryDate(expiryDate)) {
    res.status(400).json({
      ok: false,
      error: 'Expiry Date must be empty or a valid YYYY-MM-DD date.',
    });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM redeem_codes WHERE LOWER(code) = LOWER(?)')
    .get(code);
  if (existing) {
    res.status(409).json({ ok: false, error: 'This Redeem Code already exists.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('rdm');
  db.prepare(
    `INSERT INTO redeem_codes (
      id, code, label, balance, expiry_date, redemption_status, redeemed_at, max_uses, used_count, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'Unused', '', 1, 0, ?, ?, ?)`
  ).run(id, code, label, parsedBalance.value, expiryDate, status, now, now);

  res.status(201).json({
    ok: true,
    id,
    redeemCode: {
      id,
      code,
      label,
      balance: parsedBalance.value,
      expiryDate,
      redemptionStatus: 'Unused',
      redeemedAt: '',
      maxUses: 1,
      usedCount: 0,
      status,
      createdAt: now,
      updatedAt: now,
    },
  });
});

app.put('/api/admin/redeem-codes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM redeem_codes WHERE id = ?').get(id) as
    | RedeemCodeRow
    | undefined;
  if (!existing) {
    res.status(404).json({ ok: false, error: 'Redeem Code not found.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 100);
  const parsedBalance = parseRedeemBalance(body.balance);
  const expiryDate = String(body.expiryDate ?? '').trim();
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';
  const redemptionStatus =
    body.redemptionStatus === 'Redeemed'
      ? 'Redeemed'
      : body.redemptionStatus === 'Unused'
        ? 'Unused'
        : existing.redemption_status === 'Redeemed'
          ? 'Redeemed'
          : 'Unused';

  if (!REDEEM_CODE_REGEX.test(code)) {
    res.status(400).json({ ok: false, error: 'Invalid Redeem Code format.' });
    return;
  }

  if (!parsedBalance.valid) {
    res.status(400).json({
      ok: false,
      error: 'Balance must be a valid non-negative amount (₹).',
    });
    return;
  }

  if (!isValidExpiryDate(expiryDate)) {
    res.status(400).json({
      ok: false,
      error: 'Expiry Date must be empty or a valid YYYY-MM-DD date.',
    });
    return;
  }

  const dup = db
    .prepare('SELECT id FROM redeem_codes WHERE LOWER(code) = LOWER(?) AND id != ?')
    .get(code, id);
  if (dup) {
    res.status(409).json({ ok: false, error: 'Another entry already uses this Redeem Code.' });
    return;
  }

  const now = new Date().toISOString();
  const nextRedeemedAt =
    redemptionStatus === 'Unused' ? '' : existing.redeemed_at || now;
  const nextUsedCount = redemptionStatus === 'Unused' ? 0 : Math.max(1, existing.used_count);

  db.prepare(
    `UPDATE redeem_codes
     SET code = ?, label = ?, balance = ?, expiry_date = ?, redemption_status = ?, redeemed_at = ?, used_count = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    code,
    label,
    parsedBalance.value,
    expiryDate,
    redemptionStatus,
    nextRedeemedAt,
    nextUsedCount,
    status,
    now,
    id
  );

  res.json({ ok: true });
});

app.patch('/api/admin/redeem-codes/:id/status', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const row = db.prepare('SELECT status FROM redeem_codes WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ ok: false, error: 'Redeem Code not found.' });
    return;
  }
  const nextStatus = row.status === 'Active' ? 'Inactive' : 'Active';
  db.prepare('UPDATE redeem_codes SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    new Date().toISOString(),
    id
  );
  res.json({ ok: true, status: nextStatus });
});

app.delete('/api/admin/redeem-codes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM redeem_codes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: 'Redeem Code not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- Protected Admin Routes: IP Codes ---
app.get('/api/admin/ip-codes', requireAdminAuth, (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM ip_codes ORDER BY created_at DESC')
    .all() as unknown as IpCodeRow[];

  res.json({
    ok: true,
    ipCodes: rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      status: r.status === 'Inactive' ? 'Inactive' : 'Active',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

app.post('/api/admin/ip-codes', requireAdminAuth, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 100);
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!IP_CODE_REGEX.test(code)) {
    res.status(400).json({
      ok: false,
      error: 'IP Code must be 1–64 chars using letters, numbers, or . _ : / -',
    });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM ip_codes WHERE LOWER(code) = LOWER(?)')
    .get(code);
  if (existing) {
    res.status(409).json({ ok: false, error: 'This IP Code already exists.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('ipc');
  db.prepare(
    `INSERT INTO ip_codes (id, code, label, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, code, label, status, now, now);

  res.status(201).json({
    ok: true,
    id,
    ipCode: {
      id,
      code,
      label,
      status,
      createdAt: now,
      updatedAt: now,
    },
  });
});

app.put('/api/admin/ip-codes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM ip_codes WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ ok: false, error: 'IP Code not found.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = String(body.code ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 100);
  const status = body.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!IP_CODE_REGEX.test(code)) {
    res.status(400).json({
      ok: false,
      error: 'IP Code must be 1–64 chars using letters, numbers, or . _ : / -',
    });
    return;
  }

  const dup = db
    .prepare('SELECT id FROM ip_codes WHERE LOWER(code) = LOWER(?) AND id != ?')
    .get(code, id);
  if (dup) {
    res.status(409).json({ ok: false, error: 'Another entry already uses this IP Code.' });
    return;
  }

  db.prepare(
    `UPDATE ip_codes SET code = ?, label = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(code, label, status, new Date().toISOString(), id);

  res.json({ ok: true });
});

app.patch('/api/admin/ip-codes/:id/status', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const row = db.prepare('SELECT status FROM ip_codes WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ ok: false, error: 'IP Code not found.' });
    return;
  }
  const nextStatus = row.status === 'Active' ? 'Inactive' : 'Active';
  db.prepare('UPDATE ip_codes SET status = ?, updated_at = ? WHERE id = ?').run(
    nextStatus,
    new Date().toISOString(),
    id
  );
  res.json({ ok: true, status: nextStatus });
});

app.delete('/api/admin/ip-codes/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM ip_codes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: 'IP Code not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- Protected Admin Routes: Submitted Connection Requests ---
app.get('/api/admin/requests', requireAdminAuth, (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM connection_requests ORDER BY created_at DESC LIMIT 200')
    .all() as Array<{
    id: string;
    country_name: string;
    country_code: string;
    ip_address: string;
    redeem_code: string;
    ip_code: string;
    result_status: string;
    status_reason: string;
    created_at: string;
  }>;

  res.json({
    ok: true,
    requests: rows.map((r) => ({
      id: r.id,
      countryName: r.country_name,
      countryCode: r.country_code,
      ipAddress: r.ip_address,
      redeemCode: r.redeem_code,
      ipCode: r.ip_code,
      resultStatus: r.result_status === 'Rejected' ? 'Rejected' : 'Connected',
      statusReason: r.status_reason,
      createdAt: r.created_at,
    })),
  });
});

app.delete('/api/admin/requests/:id', requireAdminAuth, (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM connection_requests WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ ok: false, error: 'Request log not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- Vite Dev Middleware or Production Static Serving ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IndoXDPro server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
