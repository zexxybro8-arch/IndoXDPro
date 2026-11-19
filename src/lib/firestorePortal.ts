import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { COUNTRY_OPTIONS } from './countries';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  PRIMARY_ADMIN_ID,
  db,
  handleFirestoreError,
} from './firebase';
import { FIELD_LIMITS, isStrictIpAddress, validateVpnInput } from './validation';
import {
  AdminIdMappingEntry,
  ConnectionRequestLog,
  FlagMode,
  IpCodeEntry,
  ManagedCountry,
  ManagedVpnEntry,
  RedeemCodeEntry,
  RedemptionStatus,
  ServerStatus,
  VpnServerInput,
} from '../types/vpn';

const IP_CODE_REGEX = /^[a-zA-Z0-9_.:/-]{1,64}$/;
const REDEEM_CODE_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const ADMIN_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const EXPIRY_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODE_REGEX = /^([A-Z]{2}(-[A-Z]{2,3})?)?$/;

export interface RedeemVerificationResult {
  valid: boolean;
  docId?: string;
  code?: string;
  balance?: number;
  status?: ServerStatus;
  expiryDate?: string;
  redemptionStatus?: RedemptionStatus;
  error?: string;
  reason?: string;
}

export interface IpCodeVerificationResult {
  valid: boolean;
  docId?: string;
  code?: string;
  status?: ServerStatus;
  error?: string;
  reason?: string;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function utf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toIpCodeDocId(code: string): string {
  return `ipc_${utf8ToBase64Url(code.trim().toLowerCase())}`;
}

export function toRedeemCodeDocId(code: string): string {
  return `rdm_${code.trim().toLowerCase()}`;
}

export function getLocalIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidExpiryDate(value: string): boolean {
  if (!value) return true;
  if (!EXPIRY_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function expiryDateToTimestamp(expiryDate: string): Timestamp {
  if (!expiryDate) {
    return Timestamp.fromDate(new Date('2999-12-31T23:59:59.999Z'));
  }
  const [y, m, d] = expiryDate.split('-').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d, 23, 59, 59, 999));
}

function isRedeemExpired(expiryDate: string): boolean {
  const trimmed = expiryDate.trim();
  if (!trimmed) {
    return false;
  }
  return trimmed < getLocalIsoDate();
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

function sanitizeSafeIdFragment(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

// --- Real-Time Listeners ---

export function subscribePortalCountries(
  onData: (countries: ManagedCountry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'countries';
  const q = query(collection(db, path), where('isActive', 'in', [true, false]));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(
          COUNTRY_OPTIONS.map((c) => ({
            id: `cty_${c.code.toLowerCase()}`,
            name: c.name,
            code: c.code,
            keywords: c.keywords ?? '',
            flagMode: 'preset' as const,
            flagDataUrl: '',
            isActive: true,
          }))
        );
        return;
      }

      const activeList: ManagedCountry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.name ?? ''),
            code: String(data.code ?? ''),
            keywords: String(data.keywords ?? ''),
            flagMode: (data.flagMode === 'upload' ? 'upload' : 'preset') as FlagMode,
            flagDataUrl: String(data.flagDataUrl ?? ''),
            isActive: Boolean(data.isActive),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .filter((c) => c.isActive)
        .sort((a, b) => a.name.localeCompare(b.name));

      onData(activeList);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminCountries(
  onData: (countries: ManagedCountry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'countries';
  const q = query(collection(db, path), where('isActive', 'in', [true, false]));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(
          COUNTRY_OPTIONS.map((c) => ({
            id: `cty_${c.code.toLowerCase()}`,
            name: c.name,
            code: c.code,
            keywords: c.keywords ?? '',
            flagMode: 'preset' as const,
            flagDataUrl: '',
            isActive: true,
          }))
        );
        return;
      }

      const list: ManagedCountry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: String(data.name ?? ''),
            code: String(data.code ?? ''),
            keywords: String(data.keywords ?? ''),
            flagMode: (data.flagMode === 'upload' ? 'upload' : 'preset') as FlagMode,
            flagDataUrl: String(data.flagDataUrl ?? ''),
            isActive: Boolean(data.isActive),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminVpnEntries(
  onData: (entries: ManagedVpnEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'vpn_servers';
  const q = query(collection(db, path), where('status', 'in', ['Active', 'Inactive']));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ManagedVpnEntry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            countryName: String(data.countryName ?? ''),
            countryCode: String(data.countryCode ?? ''),
            flagMode: (data.flagMode === 'upload' ? 'upload' : 'preset') as FlagMode,
            flagDataUrl: String(data.flagDataUrl ?? ''),
            ipAddress: String(data.ipAddress ?? ''),
            ipCode: String(data.ipCode ?? ''),
            status: (data.status === 'Inactive' ? 'Inactive' : 'Active') as ServerStatus,
            username: String(data.username ?? ''),
            password: String(data.password ?? ''),
            notes: String(data.notes ?? ''),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminIpCodes(
  onData: (ipCodes: IpCodeEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'ip_codes';
  const q = query(collection(db, path), where('status', 'in', ['Active', 'Inactive']));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: IpCodeEntry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            code: String(data.code ?? ''),
            label: String(data.label ?? ''),
            status: (data.status === 'Inactive' ? 'Inactive' : 'Active') as ServerStatus,
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminRedeemCodes(
  onData: (redeemCodes: RedeemCodeEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'redeem_codes';
  const q = query(collection(db, path), where('status', 'in', ['Active', 'Inactive']));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: RedeemCodeEntry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          const redemptionStatus: RedemptionStatus =
            data.redemptionStatus === 'Redeemed' ? 'Redeemed' : 'Unused';
          return {
            id: docSnap.id,
            code: String(data.code ?? ''),
            label: String(data.label ?? ''),
            balance: Number(data.balance ?? 0),
            expiryDate: String(data.expiryDate ?? ''),
            redemptionStatus,
            redeemedAt: String(data.redeemedAt ?? ''),
            maxUses: 1,
            usedCount: redemptionStatus === 'Redeemed' ? 1 : 0,
            status: (data.status === 'Inactive' ? 'Inactive' : 'Active') as ServerStatus,
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAdminRequests(
  onData: (requests: ConnectionRequestLog[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'connection_requests';
  const q = query(collection(db, path), where('resultStatus', 'in', ['Connected', 'Rejected']));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ConnectionRequestLog[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            countryName: String(data.countryName ?? ''),
            countryCode: String(data.countryCode ?? ''),
            ipAddress: String(data.ipAddress ?? ''),
            redeemCode: String(data.redeemCode ?? ''),
            ipCode: String(data.ipCode ?? ''),
            resultStatus: (data.resultStatus === 'Rejected' ? 'Rejected' : 'Connected') as
              | 'Connected'
              | 'Rejected',
            statusReason: String(data.statusReason ?? ''),
            createdAt: timestampToIso(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 200);
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

// --- Portal Exact-Code Lookups (Zero `list` Queries; Never Exposes Private DB) ---

async function findRedeemCodeDoc(rawCode: string) {
  const trimmed = rawCode.trim();
  const candidates = Array.from(
    new Set(
      [
        toRedeemCodeDocId(trimmed),
        `rdm_${trimmed}`,
        `rdm_${trimmed.toUpperCase()}`,
        trimmed,
        trimmed.toLowerCase(),
        trimmed.toUpperCase(),
      ].filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id))
    )
  );

  for (const docId of candidates) {
    const snap = await getDocFromServer(doc(db, 'redeem_codes', docId));
    if (snap.exists()) {
      return snap;
    }
  }
  return null;
}

async function findIpCodeDoc(rawCode: string) {
  const trimmed = rawCode.trim();
  const candidates = Array.from(
    new Set(
      [
        toIpCodeDocId(trimmed),
        `ipc_${utf8ToBase64Url(trimmed)}`,
        `ipc_${utf8ToBase64Url(trimmed.toUpperCase())}`,
        trimmed,
        trimmed.toLowerCase(),
        trimmed.toUpperCase(),
      ].filter((id) => /^[a-zA-Z0-9_-]{1,128}$/.test(id))
    )
  );

  for (const docId of candidates) {
    const snap = await getDocFromServer(doc(db, 'ip_codes', docId));
    if (snap.exists()) {
      return snap;
    }
  }
  return null;
}

function evaluateRedeemSnapshot(
  docId: string,
  data: Record<string, unknown> | undefined,
  fallbackCode: string
): RedeemVerificationResult {
  if (!data) {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'This redeem code does not exist.',
    };
  }

  const status: ServerStatus = data.status === 'Inactive' ? 'Inactive' : 'Active';
  const expiryDate = String(data.expiryDate ?? '');
  const redemptionStatus: RedemptionStatus =
    data.redemptionStatus === 'Redeemed' ? 'Redeemed' : 'Unused';

  if (status !== 'Active') {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'This redeem code is currently inactive.',
    };
  }

  if (isRedeemExpired(expiryDate)) {
    return {
      valid: false,
      error: 'Not Verified',
      reason: `This redeem code expired on ${expiryDate}.`,
    };
  }

  if (redemptionStatus === 'Redeemed') {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'This redeem code has already been redeemed.',
    };
  }

  return {
    valid: true,
    docId,
    code: String(data.code ?? fallbackCode),
    balance: Number(data.balance ?? 0),
    status,
    expiryDate,
    redemptionStatus,
  };
}

function evaluateIpCodeSnapshot(
  docId: string,
  data: Record<string, unknown> | undefined,
  fallbackCode: string
): IpCodeVerificationResult {
  if (!data) {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'IP Code is not registered by administrator.',
    };
  }

  const status: ServerStatus = data.status === 'Inactive' ? 'Inactive' : 'Active';
  if (status !== 'Active') {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'This IP Code is currently inactive.',
    };
  }

  return {
    valid: true,
    docId,
    code: String(data.code ?? fallbackCode),
    status,
  };
}

export async function verifyPortalRedeemCode(
  rawCode: string
): Promise<RedeemVerificationResult> {
  const trimmed = rawCode.trim();
  if (!trimmed || !REDEEM_CODE_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'Enter a valid redeem code (2–64 characters).',
    };
  }

  try {
    const snap = await findRedeemCodeDoc(trimmed);
    if (!snap) {
      return {
        valid: false,
        error: 'Not Verified',
        reason: 'This redeem code does not exist.',
      };
    }

    return evaluateRedeemSnapshot(snap.id, snap.data(), trimmed);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'redeem_codes');
  }
}

export async function verifyPortalIpCode(
  rawCode: string
): Promise<IpCodeVerificationResult> {
  const trimmed = rawCode.trim();
  if (!trimmed || !IP_CODE_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Not Verified',
      reason: 'Enter a valid IP Code format.',
    };
  }

  try {
    const snap = await findIpCodeDoc(trimmed);
    if (!snap) {
      return {
        valid: false,
        error: 'Not Verified',
        reason: 'IP Code is not registered by administrator.',
      };
    }

    return evaluateIpCodeSnapshot(snap.id, snap.data(), trimmed);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'ip_codes');
  }
}

export function subscribePortalRedeemCodeById(
  docId: string,
  fallbackCode: string,
  onResult: (result: RedeemVerificationResult) => void,
  onError: (error: Error) => void
): () => void {
  const path = `redeem_codes/${docId}`;
  return onSnapshot(
    doc(db, 'redeem_codes', docId),
    (snap) => {
      if (!snap.exists()) {
        onResult({
          valid: false,
          error: 'Not Verified',
          reason: 'This redeem code does not exist.',
        });
        return;
      }
      onResult(evaluateRedeemSnapshot(snap.id, snap.data(), fallbackCode));
    },
    (error) => {
      console.error('Firestore Error:', JSON.stringify({ error: error.message, path }));
      onError(error);
    }
  );
}

export function subscribePortalIpCodeById(
  docId: string,
  fallbackCode: string,
  onResult: (result: IpCodeVerificationResult) => void,
  onError: (error: Error) => void
): () => void {
  const path = `ip_codes/${docId}`;
  return onSnapshot(
    doc(db, 'ip_codes', docId),
    (snap) => {
      if (!snap.exists()) {
        onResult({
          valid: false,
          error: 'Not Verified',
          reason: 'IP Code is not registered by administrator.',
        });
        return;
      }
      onResult(evaluateIpCodeSnapshot(snap.id, snap.data(), fallbackCode));
    },
    (error) => {
      console.error('Firestore Error:', JSON.stringify({ error: error.message, path }));
      onError(error);
    }
  );
}

// --- Atomic Firestore Transaction for Portal Connection & Redemption ---

async function recordRejectedAttempt(params: {
  countryName: string;
  countryCode: string;
  ipAddress: string;
  redeemCodeId: string;
  redeemCode: string;
  ipCodeId: string;
  ipCode: string;
  reason: string;
}) {
  try {
    const requestId = generateId('req');
    await setDoc(doc(db, 'connection_requests', requestId), {
      requestId,
      countryName: params.countryName.slice(0, 80),
      countryCode: params.countryCode.slice(0, 10),
      ipAddress: params.ipAddress.slice(0, 64),
      redeemCodeId: params.redeemCodeId,
      redeemCode: params.redeemCode.slice(0, 64),
      ipCodeId: params.ipCodeId,
      ipCode: params.ipCode.slice(0, 64),
      balance: 0,
      resultStatus: 'Rejected',
      statusReason: params.reason.slice(0, 240),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Rejection logging is best-effort and must never mask the primary validation error
  }
}

export async function submitPortalConnection(payload: {
  countryCode: string;
  countryName: string;
  ipAddress: string;
  redeemCode: string;
  ipCode: string;
}): Promise<{
  countryName: string;
  countryCode: string;
  ipAddress: string;
  redeemCode: string;
  ipCode: string;
  balance: number;
  connectedAt: string;
}> {
  const countryName = payload.countryName.trim();
  const countryCode = payload.countryCode.trim().toUpperCase();
  const ipAddress = payload.ipAddress.trim();
  const redeemCode = payload.redeemCode.trim();
  const ipCode = payload.ipCode.trim();

  if (!countryName || !countryCode) {
    throw new Error('Please select a country.');
  }
  if (!isStrictIpAddress(ipAddress) || ipAddress.length > 64) {
    throw new Error('Enter a valid IPv4 or IPv6 address.');
  }
  if (!REDEEM_CODE_REGEX.test(redeemCode)) {
    throw new Error('INVALID REDEEM CODE');
  }
  if (!IP_CODE_REGEX.test(ipCode)) {
    throw new Error('IP Code must be 1–64 characters using letters, numbers, or . _ : / -');
  }

  const matchedIpSnap = await findIpCodeDoc(ipCode);
  const ipCodeDocId = matchedIpSnap?.id ?? toIpCodeDocId(ipCode);

  const matchedRedeemSnap = await findRedeemCodeDoc(redeemCode);
  const redeemCodeDocId = matchedRedeemSnap?.id ?? toRedeemCodeDocId(redeemCode);

  const nowIso = new Date().toISOString();
  const requestId = generateId('req');

  try {
    const result = await runTransaction(db, async (tx) => {
      const ipRef = doc(db, 'ip_codes', ipCodeDocId);
      const redeemRef = doc(db, 'redeem_codes', redeemCodeDocId);
      const reqRef = doc(db, 'connection_requests', requestId);

      const [ipSnap, redeemSnap] = await Promise.all([tx.get(ipRef), tx.get(redeemRef)]);

      if (!ipSnap.exists()) {
        throw new Error('IP Code is not registered by administrator.');
      }
      const ipData = ipSnap.data();
      if (ipData.status !== 'Active') {
        throw new Error('This IP Code is currently inactive.');
      }

      if (!redeemSnap.exists()) {
        throw new Error('INVALID REDEEM CODE');
      }
      const rdmData = redeemSnap.data();
      if (rdmData.status !== 'Active') {
        throw new Error('INVALID REDEEM CODE — This redeem code is inactive.');
      }
      const expiryDate = String(rdmData.expiryDate ?? '');
      if (isRedeemExpired(expiryDate)) {
        throw new Error(
          `INVALID REDEEM CODE — Expired on ${expiryDate}.`
        );
      }
      if (rdmData.redemptionStatus === 'Redeemed') {
        throw new Error('This redeem code has already been redeemed.');
      }

      const authoritativeBalance = Number(rdmData.balance ?? 0);
      const canonicalRedeem = String(rdmData.code ?? redeemCode);
      const canonicalIpCode = String(ipData.code ?? ipCode);

      tx.update(redeemRef, {
        redemptionStatus: 'Redeemed',
        redeemedAt: nowIso,
        updatedAt: serverTimestamp(),
      });

      tx.set(reqRef, {
        requestId,
        countryName: countryName.slice(0, 80),
        countryCode: countryCode.slice(0, 10),
        ipAddress,
        redeemCodeId: redeemCodeDocId,
        redeemCode: canonicalRedeem,
        ipCodeId: ipCodeDocId,
        ipCode: canonicalIpCode,
        balance: authoritativeBalance,
        resultStatus: 'Connected',
        statusReason: `Verified endpoint & redeemed ₹${authoritativeBalance}`.slice(0, 240),
        createdAt: serverTimestamp(),
      });

      return {
        countryName,
        countryCode,
        ipAddress,
        redeemCode: canonicalRedeem,
        ipCode: canonicalIpCode,
        balance: authoritativeBalance,
        connectedAt: nowIso,
      };
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to connect VPN.';
    await recordRejectedAttempt({
      countryName,
      countryCode,
      ipAddress,
      redeemCodeId: redeemCodeDocId,
      redeemCode,
      ipCodeId: ipCodeDocId,
      ipCode,
      reason: message,
    });
    throw new Error(message);
  }
}

// --- Admin Country Operations ---

export async function seedCountriesIfEmpty(adminUid: string): Promise<void> {
  const colRef = collection(db, 'countries');
  try {
    const checkSnap = await getDocs(
      query(colRef, where('isActive', 'in', [true, false]), limit(1))
    );
    if (!checkSnap.empty) return;

    const batch = writeBatch(db);
    for (const c of COUNTRY_OPTIONS) {
      const countryId = `cty_${c.code.toLowerCase()}`;
      batch.set(doc(db, 'countries', countryId), {
        countryId,
        name: c.name.slice(0, 80),
        code: c.code.toUpperCase(),
        keywords: (c.keywords ?? '').slice(0, 200),
        flagMode: 'preset',
        flagDataUrl: '',
        isActive: true,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'countries');
  }
}

export async function createAdminCountry(
  adminUid: string,
  input: {
    name: string;
    code: string;
    flagMode: FlagMode;
    flagDataUrl: string;
    keywords?: string;
    isActive: boolean;
  }
): Promise<void> {
  const name = input.name.trim();
  const flagMode: FlagMode = input.flagMode === 'upload' ? 'upload' : 'preset';
  const code = flagMode === 'preset' ? input.code.trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? input.flagDataUrl.trim() : '';
  const keywords = (input.keywords ?? '').trim().slice(0, 200);

  if (name.length < 2 || name.length > 80) {
    throw new Error('Country name must be 2–80 characters.');
  }
  if (flagMode === 'preset' && (!code || !COUNTRY_CODE_REGEX.test(code))) {
    throw new Error('Select a valid ISO country flag.');
  }
  if (flagMode === 'upload' && (!flagDataUrl || flagDataUrl.length > FIELD_LIMITS.flagDataUrlMax)) {
    throw new Error('Upload a valid flag image under 90 KB.');
  }

  const slug = sanitizeSafeIdFragment(name) || 'custom';
  const countryId = generateId(`cty_${slug}`);

  try {
    await setDoc(doc(db, 'countries', countryId), {
      countryId,
      name,
      code,
      keywords,
      flagMode,
      flagDataUrl,
      isActive: Boolean(input.isActive),
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `countries/${countryId}`);
  }
}

export async function updateAdminCountry(
  id: string,
  input: {
    name: string;
    code: string;
    flagMode: FlagMode;
    flagDataUrl: string;
    keywords?: string;
    isActive: boolean;
  }
): Promise<void> {
  const name = input.name.trim();
  const flagMode: FlagMode = input.flagMode === 'upload' ? 'upload' : 'preset';
  const code = flagMode === 'preset' ? input.code.trim().toUpperCase() : '';
  const flagDataUrl = flagMode === 'upload' ? input.flagDataUrl.trim() : '';
  const keywords = (input.keywords ?? '').trim().slice(0, 200);

  if (name.length < 2 || name.length > 80) {
    throw new Error('Country name must be 2–80 characters.');
  }
  if (flagMode === 'preset' && (!code || !COUNTRY_CODE_REGEX.test(code))) {
    throw new Error('Select a valid ISO country flag.');
  }
  if (flagMode === 'upload' && (!flagDataUrl || flagDataUrl.length > FIELD_LIMITS.flagDataUrlMax)) {
    throw new Error('Upload a valid flag image under 90 KB.');
  }

  try {
    await updateDoc(doc(db, 'countries', id), {
      name,
      code,
      keywords,
      flagMode,
      flagDataUrl,
      isActive: Boolean(input.isActive),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `countries/${id}`);
  }
}

export async function deleteAdminCountry(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'countries', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `countries/${id}`);
  }
}

// --- Admin VPN Entries Operations (`vpn_servers`) ---

export async function createAdminVpnEntry(
  adminUid: string,
  rawInput: VpnServerInput
): Promise<void> {
  const { isValid, errors, sanitized } = validateVpnInput(rawInput);
  if (!isValid) {
    const firstError = Object.values(errors)[0] || 'Invalid VPN entry fields.';
    throw new Error(firstError);
  }

  const id = generateId('srv');
  const ipCodeId = toIpCodeDocId(sanitized.ipCode);
  const ipCodeRef = doc(db, 'ip_codes', ipCodeId);

  try {
    const ipCodeSnap = await getDoc(ipCodeRef);
    const batch = writeBatch(db);
    batch.set(doc(db, 'vpn_servers', id), {
      ...sanitized,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (!ipCodeSnap.exists()) {
      batch.set(ipCodeRef, {
        codeId: ipCodeId,
        code: sanitized.ipCode,
        label: sanitized.countryName.slice(0, 100),
        status: sanitized.status,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `vpn_servers/${id}`);
  }
}

export async function updateAdminVpnEntry(
  adminUid: string,
  id: string,
  rawInput: VpnServerInput
): Promise<void> {
  const { isValid, errors, sanitized } = validateVpnInput(rawInput);
  if (!isValid) {
    const firstError = Object.values(errors)[0] || 'Invalid VPN entry fields.';
    throw new Error(firstError);
  }

  const ipCodeId = toIpCodeDocId(sanitized.ipCode);
  const ipCodeRef = doc(db, 'ip_codes', ipCodeId);

  try {
    const ipCodeSnap = await getDoc(ipCodeRef);
    const batch = writeBatch(db);
    batch.update(doc(db, 'vpn_servers', id), {
      countryName: sanitized.countryName,
      countryCode: sanitized.countryCode,
      flagMode: sanitized.flagMode,
      flagDataUrl: sanitized.flagDataUrl,
      ipAddress: sanitized.ipAddress,
      ipCode: sanitized.ipCode,
      status: sanitized.status,
      username: sanitized.username,
      password: sanitized.password,
      notes: sanitized.notes,
      updatedAt: serverTimestamp(),
    });
    if (!ipCodeSnap.exists()) {
      batch.set(ipCodeRef, {
        codeId: ipCodeId,
        code: sanitized.ipCode,
        label: sanitized.countryName.slice(0, 100),
        status: sanitized.status,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `vpn_servers/${id}`);
  }
}

export async function toggleAdminVpnEntryStatus(
  id: string,
  currentStatus: ServerStatus
): Promise<ServerStatus> {
  const nextStatus: ServerStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
  try {
    await updateDoc(doc(db, 'vpn_servers', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    return nextStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `vpn_servers/${id}`);
  }
}

export async function deleteAdminVpnEntry(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'vpn_servers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `vpn_servers/${id}`);
  }
}

// --- Admin IP Codes Operations (`ip_codes`) ---

export async function createAdminIpCode(
  adminUid: string,
  input: { code: string; label?: string; status: ServerStatus }
): Promise<void> {
  const code = input.code.trim();
  const label = (input.label ?? '').trim().slice(0, 100);
  const status: ServerStatus = input.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!IP_CODE_REGEX.test(code)) {
    throw new Error('IP Code must be 1–64 chars using letters, numbers, or . _ : / -');
  }

  const codeId = toIpCodeDocId(code);
  const docRef = doc(db, 'ip_codes', codeId);

  try {
    const existing = await findIpCodeDoc(code);
    if (existing) {
      throw new Error('This IP Code already exists.');
    }

    await setDoc(docRef, {
      codeId,
      code,
      label,
      status,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'This IP Code already exists.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `ip_codes/${codeId}`);
  }
}

export async function updateAdminIpCode(
  adminUid: string,
  oldId: string,
  input: { code: string; label?: string; status: ServerStatus }
): Promise<void> {
  const code = input.code.trim();
  const label = (input.label ?? '').trim().slice(0, 100);
  const status: ServerStatus = input.status === 'Inactive' ? 'Inactive' : 'Active';

  if (!IP_CODE_REGEX.test(code)) {
    throw new Error('IP Code must be 1–64 chars using letters, numbers, or . _ : / -');
  }

  const newId = toIpCodeDocId(code);

  try {
    if (newId === oldId) {
      await updateDoc(doc(db, 'ip_codes', oldId), {
        code,
        label,
        status,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    await runTransaction(db, async (tx) => {
      const oldRef = doc(db, 'ip_codes', oldId);
      const newRef = doc(db, 'ip_codes', newId);
      const [oldSnap, newSnap] = await Promise.all([tx.get(oldRef), tx.get(newRef)]);
      if (!oldSnap.exists()) {
        throw new Error('IP Code not found.');
      }
      if (newSnap.exists()) {
        throw new Error('Another entry already uses this IP Code.');
      }
      tx.set(newRef, {
        codeId: newId,
        code,
        label,
        status,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.delete(oldRef);
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'IP Code not found.' ||
        error.message === 'Another entry already uses this IP Code.')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `ip_codes/${oldId}`);
  }
}

export async function toggleAdminIpCodeStatus(
  id: string,
  currentStatus: ServerStatus
): Promise<ServerStatus> {
  const nextStatus: ServerStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
  try {
    await updateDoc(doc(db, 'ip_codes', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    return nextStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ip_codes/${id}`);
  }
}

export async function deleteAdminIpCode(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'ip_codes', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ip_codes/${id}`);
  }
}

// --- Admin Redeem Codes Operations (`redeem_codes`) ---

export async function createAdminRedeemCode(
  adminUid: string,
  input: {
    code: string;
    balance: number;
    status: ServerStatus;
    expiryDate?: string;
    label?: string;
  }
): Promise<void> {
  const code = input.code.trim();
  const label = (input.label ?? '').trim().slice(0, 100);
  const expiryDate = (input.expiryDate ?? '').trim();
  const status: ServerStatus = input.status === 'Inactive' ? 'Inactive' : 'Active';
  const balance = Number(input.balance);

  if (!REDEEM_CODE_REGEX.test(code)) {
    throw new Error('Redeem Code must be 2–64 chars using letters, numbers, - or _.');
  }
  if (!Number.isFinite(balance) || balance < 0 || balance > 10000000) {
    throw new Error('Balance must be a valid non-negative amount (₹).');
  }
  if (!isValidExpiryDate(expiryDate)) {
    throw new Error('Expiry Date must be empty or a valid YYYY-MM-DD date.');
  }

  const roundedBalance = Math.round(balance * 100) / 100;
  const codeId = toRedeemCodeDocId(code);
  const docRef = doc(db, 'redeem_codes', codeId);

  try {
    const existing = await findRedeemCodeDoc(code);
    if (existing) {
      throw new Error('This Redeem Code already exists.');
    }

    await setDoc(docRef, {
      codeId,
      code,
      label,
      balance: roundedBalance,
      status,
      expiryDate,
      expiresAt: expiryDateToTimestamp(expiryDate),
      redemptionStatus: 'Unused',
      redeemedAt: '',
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'This Redeem Code already exists.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `redeem_codes/${codeId}`);
  }
}

export async function updateAdminRedeemCode(
  adminUid: string,
  oldId: string,
  input: {
    code: string;
    balance: number;
    status: ServerStatus;
    expiryDate?: string;
    redemptionStatus?: RedemptionStatus;
    label?: string;
  }
): Promise<void> {
  const code = input.code.trim();
  const label = (input.label ?? '').trim().slice(0, 100);
  const expiryDate = (input.expiryDate ?? '').trim();
  const status: ServerStatus = input.status === 'Inactive' ? 'Inactive' : 'Active';
  const balance = Number(input.balance);

  if (!REDEEM_CODE_REGEX.test(code)) {
    throw new Error('Redeem Code must be 2–64 chars using letters, numbers, - or _.');
  }
  if (!Number.isFinite(balance) || balance < 0 || balance > 10000000) {
    throw new Error('Balance must be a valid non-negative amount (₹).');
  }
  if (!isValidExpiryDate(expiryDate)) {
    throw new Error('Expiry Date must be empty or a valid YYYY-MM-DD date.');
  }

  const roundedBalance = Math.round(balance * 100) / 100;
  const newId = toRedeemCodeDocId(code);

  try {
    if (newId === oldId) {
      const existingSnap = await getDoc(doc(db, 'redeem_codes', oldId));
      if (!existingSnap.exists()) {
        throw new Error('Redeem Code not found.');
      }
      const existingData = existingSnap.data();
      const nextRedemption: RedemptionStatus =
        input.redemptionStatus === 'Redeemed'
          ? 'Redeemed'
          : input.redemptionStatus === 'Unused'
            ? 'Unused'
            : existingData.redemptionStatus === 'Redeemed'
              ? 'Redeemed'
              : 'Unused';
      const nextRedeemedAt =
        nextRedemption === 'Unused'
          ? ''
          : String(existingData.redeemedAt || new Date().toISOString());

      await updateDoc(doc(db, 'redeem_codes', oldId), {
        code,
        label,
        balance: roundedBalance,
        status,
        expiryDate,
        expiresAt: expiryDateToTimestamp(expiryDate),
        redemptionStatus: nextRedemption,
        redeemedAt: nextRedeemedAt,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    await runTransaction(db, async (tx) => {
      const oldRef = doc(db, 'redeem_codes', oldId);
      const newRef = doc(db, 'redeem_codes', newId);
      const [oldSnap, newSnap] = await Promise.all([tx.get(oldRef), tx.get(newRef)]);
      if (!oldSnap.exists()) {
        throw new Error('Redeem Code not found.');
      }
      if (newSnap.exists()) {
        throw new Error('Another entry already uses this Redeem Code.');
      }
      const oldData = oldSnap.data();
      const nextRedemption: RedemptionStatus =
        input.redemptionStatus === 'Redeemed'
          ? 'Redeemed'
          : input.redemptionStatus === 'Unused'
            ? 'Unused'
            : oldData.redemptionStatus === 'Redeemed'
              ? 'Redeemed'
              : 'Unused';
      const nextRedeemedAt =
        nextRedemption === 'Unused'
          ? ''
          : String(oldData.redeemedAt || new Date().toISOString());

      tx.set(newRef, {
        codeId: newId,
        code,
        label,
        balance: roundedBalance,
        status,
        expiryDate,
        expiresAt: expiryDateToTimestamp(expiryDate),
        redemptionStatus: nextRedemption,
        redeemedAt: nextRedeemedAt,
        createdBy: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.delete(oldRef);
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Redeem Code not found.' ||
        error.message === 'Another entry already uses this Redeem Code.')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `redeem_codes/${oldId}`);
  }
}

export async function toggleAdminRedeemCodeStatus(
  id: string,
  currentStatus: ServerStatus
): Promise<ServerStatus> {
  const nextStatus: ServerStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
  try {
    await updateDoc(doc(db, 'redeem_codes', id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    return nextStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `redeem_codes/${id}`);
  }
}

export async function deleteAdminRedeemCode(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'redeem_codes', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `redeem_codes/${id}`);
  }
}

export async function deleteAdminRequest(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'connection_requests', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `connection_requests/${id}`);
  }
}

// --- Admin ID & Profile Management (Zero Passwords Stored) ---

export async function resolveAdminAuthEmail(
  adminIdInput: string
): Promise<{ adminId: string; authEmail: string }> {
  const trimmed = adminIdInput.trim();
  if (!trimmed) {
    throw new Error('Please enter your Admin ID.');
  }

  const normalizedKey = trimmed.toLowerCase();
  if (ADMIN_ID_REGEX.test(trimmed)) {
    try {
      const mappingSnap = await getDoc(doc(db, 'admin_ids', normalizedKey));
      if (mappingSnap.exists()) {
        const data = mappingSnap.data();
        if (data.isActive === false) {
          throw new Error('This Admin ID has been deactivated.');
        }
        const authEmail = String(data.authEmail ?? '').trim().toLowerCase();
        if (!authEmail) {
          throw new Error('Admin ID account configuration is incomplete.');
        }
        return {
          adminId: String(data.adminId ?? trimmed),
          authEmail,
        };
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'This Admin ID has been deactivated.' ||
          error.message === 'Admin ID account configuration is incomplete.')
      ) {
        throw error;
      }
      // Fall through if mapping doc lookup failed due to missing record
    }

    if (normalizedKey === PRIMARY_ADMIN_ID.toLowerCase()) {
      return {
        adminId: PRIMARY_ADMIN_ID,
        authEmail: BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase(),
      };
    }

    throw new Error('Invalid Admin ID or password.');
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 160) {
    return {
      adminId: trimmed,
      authEmail: normalizedKey,
    };
  }

  throw new Error('Invalid Admin ID or password.');
}

export async function ensureAdminProfileInFirestore(
  user: User,
  usedAdminId?: string
): Promise<void> {
  if (!user.emailVerified || !user.email) return;

  const emailLower = user.email.trim().toLowerCase();
  const isPrimary = emailLower === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const candidateAdminId =
    usedAdminId && ADMIN_ID_REGEX.test(usedAdminId.trim())
      ? usedAdminId.trim()
      : isPrimary
        ? PRIMARY_ADMIN_ID
        : '';

  const adminRef = doc(db, 'admins', user.uid);
  try {
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: emailLower,
        ...(candidateAdminId ? { adminId: candidateAdminId } : {}),
        displayName: user.displayName ? user.displayName.slice(0, 80) : 'IndoXDPro Administrator',
        role: isPrimary ? 'SuperAdmin' : 'Admin',
        isActive: true,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = adminSnap.data();
      const needsProfilePatch =
        (candidateAdminId && !existingData.adminId) ||
        !existingData.displayName ||
        !existingData.role ||
        existingData.isActive === undefined;
      if (needsProfilePatch) {
        await updateDoc(adminRef, {
          adminId: String(existingData.adminId || candidateAdminId || ''),
          displayName: String(
            existingData.displayName || user.displayName || 'IndoXDPro Administrator'
          ).slice(0, 80),
          role: existingData.role === 'SuperAdmin' || isPrimary ? 'SuperAdmin' : 'Admin',
          isActive: existingData.isActive !== false,
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (candidateAdminId) {
      const idKey = candidateAdminId.toLowerCase();
      const mapRef = doc(db, 'admin_ids', idKey);
      const mapSnap = await getDoc(mapRef);
      if (!mapSnap.exists()) {
        await setDoc(mapRef, {
          idKey,
          adminId: candidateAdminId,
          authEmail: emailLower,
          uid: user.uid,
          displayName: (user.displayName || 'IndoXDPro Administrator').slice(0, 80),
          isActive: true,
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (!mapSnap.data().uid) {
        await updateDoc(mapRef, {
          uid: user.uid,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Profile sync is best-effort for bootstrapped admins; rules still protect writes
  }
}

export function subscribeAdminIdMappings(
  onData: (mappings: AdminIdMappingEntry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const path = 'admin_ids';
  const q = query(collection(db, path), where('isActive', 'in', [true, false]));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AdminIdMappingEntry[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            idKey: String(data.idKey ?? docSnap.id),
            adminId: String(data.adminId ?? docSnap.id),
            authEmail: String(data.authEmail ?? ''),
            uid: String(data.uid ?? ''),
            displayName: String(data.displayName ?? ''),
            isActive: data.isActive !== false,
            updatedBy: String(data.updatedBy ?? ''),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => a.adminId.localeCompare(b.adminId));
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveAdminIdMapping(
  currentAdminUid: string,
  input: {
    adminId: string;
    authEmail: string;
    uid?: string;
    displayName?: string;
    isActive: boolean;
  }
): Promise<void> {
  const adminId = input.adminId.trim();
  const authEmail = input.authEmail.trim().toLowerCase();
  const uid = (input.uid ?? '').trim();
  const displayName = (input.displayName ?? '').trim().slice(0, 80);
  const isActive = Boolean(input.isActive);

  if (!ADMIN_ID_REGEX.test(adminId)) {
    throw new Error('Admin ID must be 2–64 characters using letters, numbers, - or _.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail) || authEmail.length > 160) {
    throw new Error('Enter a valid Firebase Authentication email address.');
  }
  if (uid && !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    throw new Error('Firebase Auth UID must contain only letters, numbers, - or _.');
  }

  const idKey = adminId.toLowerCase();
  const mapRef = doc(db, 'admin_ids', idKey);

  try {
    const existing = await getDoc(mapRef);
    if (existing.exists()) {
      await updateDoc(mapRef, {
        adminId,
        authEmail,
        uid,
        displayName,
        isActive,
        updatedBy: currentAdminUid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(mapRef, {
        idKey,
        adminId,
        authEmail,
        uid,
        displayName,
        isActive,
        updatedBy: currentAdminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (uid) {
      const adminRef = doc(db, 'admins', uid);
      const adminSnap = await getDoc(adminRef);
      if (!adminSnap.exists()) {
        await setDoc(adminRef, {
          uid,
          email: authEmail,
          adminId,
          displayName: displayName || 'IndoXDPro Admin',
          role: 'Admin',
          isActive,
          addedBy: currentAdminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(adminRef, {
          adminId,
          displayName: displayName || String(adminSnap.data().displayName || 'IndoXDPro Admin'),
          isActive: uid === currentAdminUid ? true : isActive,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `admin_ids/${idKey}`);
  }
}

export async function deleteAdminIdMapping(idKey: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'admin_ids', idKey));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `admin_ids/${idKey}`);
  }
}
