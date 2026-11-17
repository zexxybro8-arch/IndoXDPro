import {
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

const TOKEN_STORAGE_KEY = 'indoxdpro_admin_token';

function getStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    ok?: boolean;
    error?: string;
  };

  if (!response.ok) {
    if (response.status === 401) {
      setStoredAdminToken(null);
    }
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

// --- Public Portal API ---
export async function fetchPortalCountries(): Promise<ManagedCountry[]> {
  const res = await apiRequest<{
    countries: Array<{
      id: string;
      name: string;
      code: string;
      keywords?: string;
      flagMode: FlagMode;
      flagDataUrl: string;
    }>;
  }>('/api/portal/countries');

  return res.countries.map((c) => ({
    ...c,
    isActive: true,
  }));
}

export interface RedeemVerificationResult {
  valid: boolean;
  code?: string;
  balance?: number;
  status?: ServerStatus;
  expiryDate?: string;
  redemptionStatus?: RedemptionStatus;
  error?: string;
  reason?: string;
}

export async function verifyPortalRedeemCode(code: string): Promise<RedeemVerificationResult> {
  const response = await fetch('/api/portal/verify-redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });

  const payload = (await response.json().catch(() => ({}))) as RedeemVerificationResult & {
    ok?: boolean;
  };

  if (!response.ok || !payload.valid) {
    return {
      valid: false,
      error: payload.error || 'INVALID REDEEM CODE',
      reason: payload.reason || 'This redeem code cannot be used.',
    };
  }

  return {
    valid: true,
    code: payload.code,
    balance: Number(payload.balance ?? 0),
    status: payload.status,
    expiryDate: payload.expiryDate || '',
    redemptionStatus: payload.redemptionStatus,
  };
}

export interface IpCodeVerificationResult {
  valid: boolean;
  code?: string;
  status?: ServerStatus;
  error?: string;
  reason?: string;
}

export async function verifyPortalIpCode(code: string): Promise<IpCodeVerificationResult> {
  const response = await fetch('/api/portal/verify-ip-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });

  const payload = (await response.json().catch(() => ({}))) as IpCodeVerificationResult & {
    ok?: boolean;
  };

  if (!response.ok || !payload.valid) {
    return {
      valid: false,
      error: payload.error || 'Not Verified',
      reason: payload.reason || 'Invalid or inactive IP Code.',
    };
  }

  return {
    valid: true,
    code: payload.code,
    status: payload.status,
  };
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
  const res = await apiRequest<{
    connection: {
      countryName: string;
      countryCode: string;
      ipAddress: string;
      redeemCode: string;
      ipCode: string;
      balance: number;
      connectedAt: string;
    };
  }>('/api/portal/connect', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.connection;
}

// --- Admin Auth API ---
export async function checkAdminSession(): Promise<{
  authenticated: boolean;
  adminId?: string;
}> {
  try {
    const res = await apiRequest<{ authenticated: boolean; adminId: string }>(
      '/api/admin/session'
    );
    return { authenticated: res.authenticated, adminId: res.adminId };
  } catch {
    return { authenticated: false };
  }
}

export async function loginAdmin(adminId: string, password: string): Promise<{ adminId: string }> {
  const res = await apiRequest<{ adminId: string; token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ adminId, password }),
  });
  if (res.token) {
    setStoredAdminToken(res.token);
  }
  return { adminId: res.adminId };
}

export async function logoutAdmin(): Promise<void> {
  try {
    await apiRequest('/api/admin/logout', { method: 'POST' });
  } finally {
    setStoredAdminToken(null);
  }
}

// --- Admin Countries API ---
export async function fetchAdminCountries(): Promise<ManagedCountry[]> {
  const res = await apiRequest<{ countries: ManagedCountry[] }>('/api/admin/countries');
  return res.countries;
}

export async function createAdminCountry(input: {
  name: string;
  code: string;
  flagMode: FlagMode;
  flagDataUrl: string;
  keywords?: string;
  isActive: boolean;
}): Promise<void> {
  await apiRequest('/api/admin/countries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  await apiRequest(`/api/admin/countries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteAdminCountry(id: string): Promise<void> {
  await apiRequest(`/api/admin/countries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// --- Admin VPN Entries API ---
export async function fetchAdminVpnEntries(): Promise<ManagedVpnEntry[]> {
  const res = await apiRequest<{ entries: ManagedVpnEntry[] }>('/api/admin/vpn-entries');
  return res.entries;
}

export async function createAdminVpnEntry(input: VpnServerInput): Promise<void> {
  await apiRequest('/api/admin/vpn-entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminVpnEntry(id: string, input: VpnServerInput): Promise<void> {
  await apiRequest(`/api/admin/vpn-entries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function toggleAdminVpnEntryStatus(id: string): Promise<ServerStatus> {
  const res = await apiRequest<{ status: ServerStatus }>(
    `/api/admin/vpn-entries/${encodeURIComponent(id)}/status`,
    { method: 'PATCH' }
  );
  return res.status;
}

export async function deleteAdminVpnEntry(id: string): Promise<void> {
  await apiRequest(`/api/admin/vpn-entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// --- Admin Redeem Codes API ---
export async function fetchAdminRedeemCodes(): Promise<RedeemCodeEntry[]> {
  const res = await apiRequest<{ redeemCodes: RedeemCodeEntry[] }>('/api/admin/redeem-codes');
  return res.redeemCodes;
}

export async function createAdminRedeemCode(input: {
  code: string;
  balance: number;
  status: ServerStatus;
  expiryDate?: string;
  label?: string;
}): Promise<void> {
  await apiRequest('/api/admin/redeem-codes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminRedeemCode(
  id: string,
  input: {
    code: string;
    balance: number;
    status: ServerStatus;
    expiryDate?: string;
    redemptionStatus?: RedemptionStatus;
    label?: string;
  }
): Promise<void> {
  await apiRequest(`/api/admin/redeem-codes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function toggleAdminRedeemCodeStatus(id: string): Promise<ServerStatus> {
  const res = await apiRequest<{ status: ServerStatus }>(
    `/api/admin/redeem-codes/${encodeURIComponent(id)}/status`,
    { method: 'PATCH' }
  );
  return res.status;
}

export async function deleteAdminRedeemCode(id: string): Promise<void> {
  await apiRequest(`/api/admin/redeem-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// --- Admin IP Codes API ---
export async function fetchAdminIpCodes(): Promise<IpCodeEntry[]> {
  const res = await apiRequest<{ ipCodes: IpCodeEntry[] }>('/api/admin/ip-codes');
  return res.ipCodes;
}

export async function createAdminIpCode(input: {
  code: string;
  label?: string;
  status: ServerStatus;
}): Promise<void> {
  await apiRequest('/api/admin/ip-codes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminIpCode(
  id: string,
  input: {
    code: string;
    label?: string;
    status: ServerStatus;
  }
): Promise<void> {
  await apiRequest(`/api/admin/ip-codes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function toggleAdminIpCodeStatus(id: string): Promise<ServerStatus> {
  const res = await apiRequest<{ status: ServerStatus }>(
    `/api/admin/ip-codes/${encodeURIComponent(id)}/status`,
    { method: 'PATCH' }
  );
  return res.status;
}

export async function deleteAdminIpCode(id: string): Promise<void> {
  await apiRequest(`/api/admin/ip-codes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// --- Admin Connection Requests API ---
export async function fetchAdminRequests(): Promise<ConnectionRequestLog[]> {
  const res = await apiRequest<{ requests: ConnectionRequestLog[] }>('/api/admin/requests');
  return res.requests;
}

export async function deleteAdminRequest(id: string): Promise<void> {
  await apiRequest(`/api/admin/requests/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
