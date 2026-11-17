import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Network,
  Plus,
  PowerOff,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import {
  checkAdminSession,
  createAdminCountry,
  createAdminIpCode,
  createAdminRedeemCode,
  createAdminVpnEntry,
  deleteAdminCountry,
  deleteAdminIpCode,
  deleteAdminRedeemCode,
  deleteAdminRequest,
  deleteAdminVpnEntry,
  fetchAdminCountries,
  fetchAdminIpCodes,
  fetchAdminRedeemCodes,
  fetchAdminRequests,
  fetchAdminVpnEntries,
  loginAdmin,
  logoutAdmin,
  toggleAdminIpCodeStatus,
  toggleAdminRedeemCodeStatus,
  toggleAdminVpnEntryStatus,
  updateAdminCountry,
  updateAdminIpCode,
  updateAdminRedeemCode,
  updateAdminVpnEntry,
} from '../lib/adminApi';
import {
  ConnectionRequestLog,
  FlagMode,
  IpCodeEntry,
  ManagedCountry,
  ManagedVpnEntry,
  RedeemCodeEntry,
  ServerStatus,
  VpnServer,
  VpnServerInput,
} from '../types/vpn';
import {
  ConfirmDeleteModal,
  CountryFormModal,
  IpCodeModal,
  RedeemCodeModal,
} from './AdminSubModals';
import { CountryFlag } from './CountryFlag';
import { VpnFormModal } from './VpnFormModal';

interface AdminPanelProps {
  onBackToDashboard: () => void;
}

type AdminTab = 'vpn' | 'countries' | 'ipcodes' | 'redeem' | 'requests';

export function AdminPanel({ onBackToDashboard }: AdminPanelProps) {
  const { showToast } = useVpn();

  // Server-side Admin Auth State (zero hardcoded credentials in frontend)
  const [sessionChecking, setSessionChecking] = useState(true);
  const [authenticatedAdminId, setAuthenticatedAdminId] = useState<string | null>(null);

  // Login Form State
  const [adminIdInput, setAdminIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<AdminTab>('vpn');
  const [loadingData, setLoadingData] = useState(false);
  const [vpnEntries, setVpnEntries] = useState<ManagedVpnEntry[]>([]);
  const [countries, setCountries] = useState<ManagedCountry[]>([]);
  const [ipCodes, setIpCodes] = useState<IpCodeEntry[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCodeEntry[]>([]);
  const [requests, setRequests] = useState<ConnectionRequestLog[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ServerStatus>('ALL');
  const [redeemFilter, setRedeemFilter] = useState<
    'ALL' | 'Unused' | 'Redeemed' | 'Active' | 'Inactive'
  >('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Inline Add IP Code Form State
  const [newIpCode, setNewIpCode] = useState('');
  const [newIpCodeLabel, setNewIpCodeLabel] = useState('');
  const [newIpCodeStatus, setNewIpCodeStatus] = useState<ServerStatus>('Active');
  const [addingIpCode, setAddingIpCode] = useState(false);

  // Inline Add Redeem Code Form State
  const [newRedeemCode, setNewRedeemCode] = useState('');
  const [newRedeemBalance, setNewRedeemBalance] = useState('');
  const [newRedeemStatus, setNewRedeemStatus] = useState<ServerStatus>('Active');
  const [newRedeemExpiry, setNewRedeemExpiry] = useState('');
  const [addingRedeem, setAddingRedeem] = useState(false);

  // Modals State
  const [vpnModalOpen, setVpnModalOpen] = useState(false);
  const [editingVpnEntry, setEditingVpnEntry] = useState<ManagedVpnEntry | null>(null);

  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<ManagedCountry | null>(null);

  const [ipCodeModalOpen, setIpCodeModalOpen] = useState(false);
  const [editingIpCode, setEditingIpCode] = useState<IpCodeEntry | null>(null);

  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [editingRedeem, setEditingRedeem] = useState<RedeemCodeEntry | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'vpn' | 'country' | 'ipcode' | 'redeem' | 'request';
    id: string;
    label: string;
  } | null>(null);

  const loadAllAdminData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [entriesRes, countriesRes, ipCodesRes, redeemRes, requestsRes] = await Promise.all([
        fetchAdminVpnEntries(),
        fetchAdminCountries(),
        fetchAdminIpCodes(),
        fetchAdminRedeemCodes(),
        fetchAdminRequests(),
      ]);
      setVpnEntries(entriesRes);
      setCountries(countriesRes);
      setIpCodes(ipCodesRes);
      setRedeemCodes(redeemRes);
      setRequests(requestsRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load admin records.';
      showToast('Failed to load admin data', 'error', message);
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  // Verify existing server-side session on mount
  useEffect(() => {
    let active = true;
    checkAdminSession()
      .then((res) => {
        if (!active) return;
        if (res.authenticated && res.adminId) {
          setAuthenticatedAdminId(res.adminId);
        } else {
          setAuthenticatedAdminId(null);
        }
      })
      .finally(() => {
        if (active) setSessionChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authenticatedAdminId) {
      void loadAllAdminData();
    }
  }, [authenticatedAdminId, loadAllAdminData]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const trimmedId = adminIdInput.trim();
    if (!trimmedId || !passwordInput) {
      const msg = 'Please enter both Admin ID and Password.';
      setLoginError(msg);
      showToast('Authentication failed', 'error', msg);
      return;
    }

    setLoggingIn(true);
    try {
      const result = await loginAdmin(trimmedId, passwordInput);
      setAuthenticatedAdminId(result.adminId);
      setPasswordInput('');
      showToast('Admin access granted', 'success', `Signed in as ${result.adminId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid Admin ID or Password.';
      setLoginError(msg);
      showToast('Access denied', 'error', msg);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setAuthenticatedAdminId(null);
    setAdminIdInput('');
    setPasswordInput('');
    setVpnEntries([]);
    setCountries([]);
    setRedeemCodes([]);
    setRequests([]);
    showToast('Signed out from Admin Panel', 'info');
  };

  const handleCopy = async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      showToast(`${label} copied`, 'success', text);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === key ? null : cur));
      }, 1400);
    } catch {
      showToast('Clipboard denied', 'error');
    }
  };

  // Filtered views
  const filteredVpnEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vpnEntries.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.countryName.toLowerCase().includes(q) ||
        item.ipAddress.toLowerCase().includes(q) ||
        item.ipCode.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [vpnEntries, searchQuery, statusFilter]);

  const filteredCountries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return countries.filter((c) => {
      if (statusFilter === 'Active' && !c.isActive) return false;
      if (statusFilter === 'Inactive' && c.isActive) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.keywords ? c.keywords.toLowerCase().includes(q) : false)
      );
    });
  }, [countries, searchQuery, statusFilter]);

  const filteredRedeemCodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return redeemCodes.filter((r) => {
      if (redeemFilter === 'Active' && r.status !== 'Active') return false;
      if (redeemFilter === 'Inactive' && r.status !== 'Inactive') return false;
      if (redeemFilter === 'Unused' && r.redemptionStatus !== 'Unused') return false;
      if (redeemFilter === 'Redeemed' && r.redemptionStatus !== 'Redeemed') return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        String(r.balance).includes(q) ||
        (r.expiryDate && r.expiryDate.includes(q))
      );
    });
  }, [redeemCodes, searchQuery, redeemFilter]);

  const handleInlineAddRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = newRedeemCode.trim();
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(trimmedCode)) {
      showToast(
        'Invalid Redeem Code',
        'error',
        'Use 2–64 characters with letters, numbers, - or _.'
      );
      return;
    }

    const parsedBalance = Number(newRedeemBalance);
    if (
      newRedeemBalance.trim() === '' ||
      !Number.isFinite(parsedBalance) ||
      parsedBalance < 0
    ) {
      showToast('Invalid Balance', 'error', 'Enter a valid non-negative ₹ balance amount.');
      return;
    }

    setAddingRedeem(true);
    try {
      const roundedBalance = Math.round(parsedBalance * 100) / 100;
      await createAdminRedeemCode({
        code: trimmedCode,
        balance: roundedBalance,
        status: newRedeemStatus,
        expiryDate: newRedeemExpiry.trim(),
      });
      setNewRedeemCode('');
      setNewRedeemBalance('');
      setNewRedeemStatus('Active');
      setNewRedeemExpiry('');
      showToast('Redeem code added', 'success', `${trimmedCode} · ₹${roundedBalance}`);
      await loadAllAdminData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to add redeem code.';
      showToast('Failed to add code', 'error', msg);
    } finally {
      setAddingRedeem(false);
    }
  };

  const filteredIpCodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ipCodes.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q)
      );
    });
  }, [ipCodes, searchQuery, statusFilter]);

  const handleInlineAddIpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = newIpCode.trim();
    if (!/^[a-zA-Z0-9_.:/-]{1,64}$/.test(trimmedCode)) {
      showToast(
        'Invalid IP Code',
        'error',
        'Use 1–64 chars with letters, numbers, or . _ : / -'
      );
      return;
    }

    setAddingIpCode(true);
    try {
      await createAdminIpCode({
        code: trimmedCode,
        label: newIpCodeLabel.trim(),
        status: newIpCodeStatus,
      });
      setNewIpCode('');
      setNewIpCodeLabel('');
      setNewIpCodeStatus('Active');
      showToast('IP Code added', 'success', trimmedCode);
      await loadAllAdminData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to add IP Code.';
      showToast('Failed to add IP Code', 'error', msg);
    } finally {
      setAddingIpCode(false);
    }
  };

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((req) => {
      if (statusFilter === 'Active' && req.resultStatus !== 'Connected') return false;
      if (statusFilter === 'Inactive' && req.resultStatus !== 'Rejected') return false;
      if (!q) return true;
      return (
        req.countryName.toLowerCase().includes(q) ||
        req.ipAddress.toLowerCase().includes(q) ||
        req.redeemCode.toLowerCase().includes(q) ||
        req.ipCode.toLowerCase().includes(q)
      );
    });
  }, [requests, searchQuery, statusFilter]);

  // Convert ManagedVpnEntry -> VpnServer shape for VpnFormModal reuse
  const editingVpnAsServer = useMemo<VpnServer | null>(() => {
    if (!editingVpnEntry) return null;
    return {
      ...editingVpnEntry,
      createdBy: authenticatedAdminId ?? 'admin',
      createdAt: null,
      updatedAt: null,
    };
  }, [editingVpnEntry, authenticatedAdminId]);

  // --- Auth Loading Gate ---
  if (sessionChecking) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-lg items-center justify-center px-4 py-16">
        <div className="flex w-full flex-col items-center rounded-3xl border border-violet-500/20 bg-[#0A0812] p-10 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-violet-400" aria-hidden="true" />
          <p className="mt-4 text-sm text-slate-300">Verifying admin session...</p>
        </div>
      </main>
    );
  }

  // --- Admin Login Screen ---
  if (!authenticatedAdminId) {
    return (
      <main className="relative flex min-h-[calc(100vh-8rem)] w-full items-center justify-center overflow-hidden px-4 py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-700/18 blur-[120px]"
        />

        <section
          aria-label="IndoXDPro Admin Login"
          className="relative w-full max-w-[440px] rounded-3xl border border-violet-500/25 bg-[#0A0812]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_50px_rgba(124,58,237,0.14)] backdrop-blur-xl sm:p-8"
        >
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/35 bg-violet-600/15 text-violet-300 shadow-[0_0_24px_rgba(139,92,246,0.28)]">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              IndoXDPro Admin
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Authorized administrator credentials required.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            {loginError && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-2xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-xs text-rose-200"
              >
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-login-id"
                className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
              >
                Admin ID
              </label>
              <div className="portal-input-box flex min-h-[54px] items-center gap-3 rounded-2xl px-4">
                <UserCheck className="h-5 w-5 shrink-0 text-violet-400/80" aria-hidden="true" />
                <input
                  id="admin-login-id"
                  type="text"
                  value={adminIdInput}
                  disabled={loggingIn}
                  onChange={(e) => {
                    setAdminIdInput(e.target.value);
                    setLoginError(null);
                  }}
                  placeholder="Enter Admin ID"
                  autoComplete="username"
                  className="h-full w-full bg-transparent py-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-login-password"
                className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
              >
                Admin Password
              </label>
              <div className="portal-input-box flex min-h-[54px] items-center gap-3 rounded-2xl px-4">
                <KeyRound className="h-5 w-5 shrink-0 text-violet-400/80" aria-hidden="true" />
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  disabled={loggingIn}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setLoginError(null);
                  }}
                  placeholder="Enter Admin Password"
                  autoComplete="current-password"
                  className="h-full w-full bg-transparent py-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loggingIn}
                className="btn-purple-glow flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl px-6 text-sm font-bold tracking-wide text-white disabled:opacity-70"
              >
                {loggingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>VERIFYING...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    <span>ACCESS ADMIN PANEL</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="text-xs text-slate-400 transition-colors hover:text-white"
            >
              Return to IndoXDPro Portal
            </button>
          </div>
        </section>
      </main>
    );
  }

  // --- Authenticated Admin Dashboard ---
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Admin Summary & Controls */}
      <section className="rounded-2xl border border-violet-500/20 bg-[#0A0812] p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-violet-300">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>IndoXDPro Admin</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-300">{authenticatedAdminId}</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              VPN Portal Management
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeTab === 'vpn' && (
              <button
                type="button"
                onClick={() => {
                  setEditingVpnEntry(null);
                  setVpnModalOpen(true);
                }}
                className="btn-purple-glow inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add VPN Entry</span>
              </button>
            )}
            {activeTab === 'countries' && (
              <button
                type="button"
                onClick={() => {
                  setEditingCountry(null);
                  setCountryModalOpen(true);
                }}
                className="btn-purple-glow inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Country</span>
              </button>
            )}
            {activeTab === 'ipcodes' && (
              <button
                type="button"
                onClick={() => {
                  setEditingIpCode(null);
                  setIpCodeModalOpen(true);
                }}
                className="btn-purple-glow inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add IP Code</span>
              </button>
            )}
            {activeTab === 'redeem' && (
              <button
                type="button"
                onClick={() => {
                  setEditingRedeem(null);
                  setRedeemModalOpen(true);
                }}
                className="btn-purple-glow inline-flex min-h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Add Redeem Code</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadAllAdminData()}
              disabled={loadingData}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white"
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingData ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 text-sm font-medium text-rose-200 hover:bg-rose-500/20"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Metrics & Navigation Tabs */}
        <div className="mt-6 flex flex-col justify-between gap-4 border-t border-white/[0.08] pt-5 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400">VPN Entries: </span>
              <strong className="font-mono text-white tabular-nums">{vpnEntries.length}</strong>
            </div>
            <div>
              <span className="text-slate-400">Active Countries: </span>
              <strong className="font-mono text-emerald-300 tabular-nums">
                {countries.filter((c) => c.isActive).length}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">IP Codes: </span>
              <strong className="font-mono text-violet-300 tabular-nums">{ipCodes.length}</strong>
            </div>
            <div>
              <span className="text-slate-400">Redeem Codes: </span>
              <strong className="font-mono text-violet-300 tabular-nums">
                {redeemCodes.length}
              </strong>
            </div>
            <div>
              <span className="text-slate-400">Submitted Requests: </span>
              <strong className="font-mono text-white tabular-nums">{requests.length}</strong>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#050409] p-1">
            {[
              { id: 'vpn' as const, label: 'VPN Entries', icon: Network },
              { id: 'countries' as const, label: 'Country List', icon: Globe2 },
              { id: 'ipcodes' as const, label: 'IP Codes', icon: KeyRound },
              { id: 'redeem' as const, label: 'Redeem Codes', icon: Ticket },
              { id: 'requests' as const, label: 'Connection Requests', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setRedeemFilter('ALL');
                  }}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Search & Status Filter Strip */}
      <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#0A0812] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'vpn'
                ? 'Search VPN entries by country, IP address, or IP code...'
                : activeTab === 'countries'
                  ? 'Search country name or ISO code...'
                  : activeTab === 'ipcodes'
                    ? 'Search IP codes by code or label...'
                    : activeTab === 'redeem'
                      ? 'Search redeem codes by code or ₹ balance...'
                      : 'Search submitted requests by country, IP, redeem code, or IP code...'
            }
            className="min-h-[40px] w-full rounded-xl border border-white/10 bg-[#050409] pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
          />
        </div>

        {activeTab === 'redeem' ? (
          <div className="inline-flex flex-wrap shrink-0 rounded-xl border border-white/10 bg-[#050409] p-1">
            {(['ALL', 'Unused', 'Redeemed', 'Active', 'Inactive'] as const).map((filterOpt) => (
              <button
                key={filterOpt}
                type="button"
                onClick={() => setRedeemFilter(filterOpt)}
                className={`min-h-[32px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                  redeemFilter === filterOpt
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filterOpt === 'ALL' ? 'All' : filterOpt}
              </button>
            ))}
          </div>
        ) : (
          <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-[#050409] p-1">
            {(['ALL', 'Active', 'Inactive'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`min-h-[32px] whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {status === 'ALL'
                  ? 'All'
                  : activeTab === 'requests'
                    ? status === 'Active'
                      ? 'Connected'
                      : 'Rejected'
                    : status}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* TAB 1: VPN ENTRIES */}
      {activeTab === 'vpn' && (
        <section className="mt-5">
          {filteredVpnEntries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0A0812] p-12 text-center">
              <p className="font-display text-base font-semibold text-white">
                {vpnEntries.length === 0 ? 'No VPN entries added yet' : 'No matching VPN entries'}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Add IP addresses and IP codes for any country to validate and manage user VPN
                endpoints.
              </p>
              {vpnEntries.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVpnEntry(null);
                    setVpnModalOpen(true);
                  }}
                  className="btn-purple-glow mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add First VPN Entry</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0A0812]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#06050B] text-xs font-medium text-slate-400">
                    <th className="px-5 py-3.5">Country</th>
                    <th className="px-4 py-3.5">IP Address</th>
                    <th className="px-4 py-3.5">IP Code</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredVpnEntries.map((entry) => {
                    const isActive = entry.status === 'Active';
                    const toggling = togglingId === entry.id;
                    return (
                      <tr key={entry.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <CountryFlag
                              countryName={entry.countryName}
                              countryCode={entry.countryCode}
                              flagMode={entry.flagMode}
                              flagDataUrl={entry.flagDataUrl}
                              size="sm"
                            />
                            <div>
                              <p className="font-medium text-white">{entry.countryName}</p>
                              {entry.notes && (
                                <p className="max-w-xs truncate text-xs text-slate-400">
                                  {entry.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-200">
                          <div className="flex items-center gap-2">
                            <span>{entry.ipAddress}</span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(entry.ipAddress, `ip_${entry.id}`, 'IP Address')
                              }
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            >
                              {copiedId === `ip_${entry.id}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-violet-300">
                          <div className="flex items-center gap-2">
                            <span>{entry.ipCode}</span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(entry.ipCode, `code_${entry.id}`, 'IP Code')
                              }
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            >
                              {copiedId === `code_${entry.id}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            disabled={toggling}
                            onClick={async () => {
                              setTogglingId(entry.id);
                              try {
                                const next = await toggleAdminVpnEntryStatus(entry.id);
                                setVpnEntries((prev) =>
                                  prev.map((item) =>
                                    item.id === entry.id ? { ...item, status: next } : item
                                  )
                                );
                                showToast(`VPN entry marked ${next}`, 'success');
                              } finally {
                                setTogglingId(null);
                              }
                            }}
                            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                              isActive
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                            }`}
                          >
                            {toggling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isActive ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <PowerOff className="h-3.5 w-3.5" />
                            )}
                            <span>{entry.status}</span>
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVpnEntry(entry);
                                setVpnModalOpen(true);
                              }}
                              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/15"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'vpn',
                                  id: entry.id,
                                  label: `${entry.countryName} · ${entry.ipAddress}`,
                                })
                              }
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: COUNTRIES LIST */}
      {activeTab === 'countries' && (
        <section className="mt-5">
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0A0812]">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#06050B] text-xs font-medium text-slate-400">
                  <th className="px-5 py-3.5">Country &amp; Flag</th>
                  <th className="px-4 py-3.5">Code</th>
                  <th className="px-4 py-3.5">Portal Visibility</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCountries.map((country) => (
                  <tr key={country.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <CountryFlag
                          countryName={country.name}
                          countryCode={country.code}
                          flagMode={country.flagMode}
                          flagDataUrl={country.flagDataUrl}
                          size="sm"
                        />
                        <span className="font-medium text-white">{country.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {country.code || 'Custom'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await updateAdminCountry(country.id, {
                            name: country.name,
                            code: country.code,
                            flagMode: country.flagMode,
                            flagDataUrl: country.flagDataUrl,
                            keywords: country.keywords,
                            isActive: !country.isActive,
                          });
                          setCountries((prev) =>
                            prev.map((c) =>
                              c.id === country.id ? { ...c, isActive: !country.isActive } : c
                            )
                          );
                          showToast(
                            `${country.name} ${!country.isActive ? 'activated' : 'hidden'}`,
                            'success'
                          );
                        }}
                        className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                          country.isActive
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-white/12 bg-white/[0.04] text-slate-400'
                        }`}
                      >
                        {country.isActive ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCountry(country);
                            setCountryModalOpen(true);
                          }}
                          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/15"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              type: 'country',
                              id: country.id,
                              label: country.name,
                            })
                          }
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: REDEEM CODES & BALANCE MANAGEMENT */}
      {activeTab === 'redeem' && (
        <section className="mt-5 space-y-5">
          {/* Add New Redeem Code Form */}
          <form
            onSubmit={handleInlineAddRedeem}
            className="rounded-2xl border border-violet-500/20 bg-[#0A0812] p-5"
          >
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-base font-semibold text-white">
                  Add New Redeem Code
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Create custom one-time redeem codes with an assigned ₹ balance and optional expiry
                  date.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 tabular-nums">
                <span>
                  Unused:{' '}
                  <strong className="font-mono text-emerald-300">
                    {redeemCodes.filter((c) => c.redemptionStatus === 'Unused').length}
                  </strong>
                </span>
                <span>
                  Redeemed:{' '}
                  <strong className="font-mono text-amber-300">
                    {redeemCodes.filter((c) => c.redemptionStatus === 'Redeemed').length}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label
                  htmlFor="inline-rdm-code"
                  className="block text-xs font-medium text-slate-300"
                >
                  Redeem Code
                </label>
                <input
                  id="inline-rdm-code"
                  type="text"
                  value={newRedeemCode}
                  disabled={addingRedeem}
                  onChange={(e) => setNewRedeemCode(e.target.value)}
                  placeholder="Enter custom code"
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#050409] px-3.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inline-rdm-balance"
                  className="block text-xs font-medium text-slate-300"
                >
                  Balance (₹)
                </label>
                <input
                  id="inline-rdm-balance"
                  type="number"
                  min={0}
                  step="0.01"
                  value={newRedeemBalance}
                  disabled={addingRedeem}
                  onChange={(e) => setNewRedeemBalance(e.target.value)}
                  placeholder="Amount (₹)"
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#050409] px-3.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-violet-500 focus:outline-none tabular-nums"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300">Status</span>
                <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#050409] p-1">
                  {(['Active', 'Inactive'] as ServerStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={addingRedeem}
                      onClick={() => setNewRedeemStatus(s)}
                      className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                        newRedeemStatus === s
                          ? s === 'Active'
                            ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-slate-700/40 text-slate-200 ring-1 ring-white/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="inline-rdm-expiry"
                  className="block text-xs font-medium text-slate-300"
                >
                  Expiry Date <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  id="inline-rdm-expiry"
                  type="date"
                  value={newRedeemExpiry}
                  disabled={addingRedeem}
                  onChange={(e) => setNewRedeemExpiry(e.target.value)}
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#050409] px-3.5 font-mono text-xs text-white focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingRedeem}
                  className="btn-purple-glow inline-flex min-h-[42px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {addingRedeem ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Add Redeem Code</span>
                </button>
              </div>
            </div>
          </form>

          {/* Redeem Code Table */}
          {filteredRedeemCodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0A0812] p-12 text-center">
              <p className="font-display text-base font-semibold text-white">
                {redeemCodes.length === 0
                  ? 'No Redeem Codes created yet'
                  : 'No matching redeem codes'}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Use the form above to add a redeem code and balance amount.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0A0812]">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#06050B] text-xs font-medium text-slate-400">
                    <th className="px-5 py-3.5">Redeem Code</th>
                    <th className="px-4 py-3.5">Balance</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Redemption</th>
                    <th className="px-4 py-3.5">Expiry Date</th>
                    <th className="px-4 py-3.5">Created Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredRedeemCodes.map((rc) => {
                    const todayIso = new Date().toISOString().slice(0, 10);
                    const isExpired = Boolean(rc.expiryDate && rc.expiryDate < todayIso);
                    const formattedBalance = Number.isInteger(rc.balance)
                      ? rc.balance.toLocaleString('en-IN')
                      : rc.balance.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });

                    return (
                      <tr key={rc.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3.5 font-mono text-sm font-medium text-violet-300">
                          <div className="flex items-center gap-2">
                            <span>{rc.code}</span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(rc.code, `rdm_${rc.id}`, 'Redeem Code')
                              }
                              aria-label={`Copy ${rc.code}`}
                              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            >
                              {copiedId === `rdm_${rc.id}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-sm font-semibold text-white tabular-nums">
                          ₹{formattedBalance}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={async () => {
                              const next = await toggleAdminRedeemCodeStatus(rc.id);
                              setRedeemCodes((prev) =>
                                prev.map((item) =>
                                  item.id === rc.id ? { ...item, status: next } : item
                                )
                              );
                              showToast(`Redeem code marked ${next}`, 'success');
                            }}
                            className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                              rc.status === 'Active'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                            }`}
                          >
                            {rc.status}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-medium">
                          <span
                            className={
                              rc.redemptionStatus === 'Redeemed'
                                ? 'text-amber-300'
                                : 'text-emerald-300'
                            }
                          >
                            {rc.redemptionStatus}
                          </span>
                          {rc.redemptionStatus === 'Redeemed' && rc.redeemedAt && (
                            <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                              {new Date(rc.redeemedAt).toLocaleDateString()}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs tabular-nums">
                          {rc.expiryDate ? (
                            <span className={isExpired ? 'text-rose-400' : 'text-slate-300'}>
                              {rc.expiryDate}
                              {isExpired ? ' (Expired)' : ''}
                            </span>
                          ) : (
                            <span className="font-sans text-slate-500">No expiry</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-400 tabular-nums">
                          {new Date(rc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRedeem(rc);
                                setRedeemModalOpen(true);
                              }}
                              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/15"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'redeem',
                                  id: rc.id,
                                  label: `${rc.code} (₹${formattedBalance})`,
                                })
                              }
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB: IP CODES MANAGEMENT */}
      {activeTab === 'ipcodes' && (
        <section className="mt-5 space-y-5">
          {/* Add New IP Code Form */}
          <form
            onSubmit={handleInlineAddIpCode}
            className="rounded-2xl border border-violet-500/20 bg-[#0A0812] p-5"
          >
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-base font-semibold text-white">Add New IP Code</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Only Active IP Codes managed by the administrator are accepted on the IndoXDPro
                  portal.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 tabular-nums">
                <span>
                  Active:{' '}
                  <strong className="font-mono text-emerald-300">
                    {ipCodes.filter((c) => c.status === 'Active').length}
                  </strong>
                </span>
                <span>
                  Inactive:{' '}
                  <strong className="font-mono text-slate-300">
                    {ipCodes.filter((c) => c.status === 'Inactive').length}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="inline-ipc-code"
                  className="block text-xs font-medium text-slate-300"
                >
                  IP Code
                </label>
                <input
                  id="inline-ipc-code"
                  type="text"
                  value={newIpCode}
                  disabled={addingIpCode}
                  onChange={(e) => setNewIpCode(e.target.value)}
                  placeholder="Enter IP Code"
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#050409] px-3.5 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="inline-ipc-label"
                  className="block text-xs font-medium text-slate-300"
                >
                  Label / Note <span className="text-slate-500">(optional)</span>
                </label>
                <input
                  id="inline-ipc-label"
                  type="text"
                  value={newIpCodeLabel}
                  disabled={addingIpCode}
                  onChange={(e) => setNewIpCodeLabel(e.target.value)}
                  placeholder="e.g. Node description"
                  className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#050409] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300">Status</span>
                <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#050409] p-1">
                  {(['Active', 'Inactive'] as ServerStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={addingIpCode}
                      onClick={() => setNewIpCodeStatus(s)}
                      className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                        newIpCodeStatus === s
                          ? s === 'Active'
                            ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-slate-700/40 text-slate-200 ring-1 ring-white/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={addingIpCode}
                  className="btn-purple-glow inline-flex min-h-[42px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {addingIpCode ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Add IP Code</span>
                </button>
              </div>
            </div>
          </form>

          {/* IP Codes Table */}
          {filteredIpCodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0A0812] p-12 text-center">
              <p className="font-display text-base font-semibold text-white">
                {ipCodes.length === 0 ? 'No IP Codes added yet' : 'No matching IP Codes'}
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                Use the form above to add active IP Codes for user verification.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0A0812]">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#06050B] text-xs font-medium text-slate-400">
                    <th className="px-5 py-3.5">IP Code</th>
                    <th className="px-4 py-3.5">Label</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Created Date</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredIpCodes.map((ic) => (
                    <tr key={ic.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 font-mono text-sm font-medium text-violet-300">
                        <div className="flex items-center gap-2">
                          <span>{ic.code}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopy(ic.code, `ipc_${ic.id}`, 'IP Code')}
                            aria-label={`Copy ${ic.code}`}
                            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                          >
                            {copiedId === `ipc_${ic.id}` ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">{ic.label || '—'}</td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const next = await toggleAdminIpCodeStatus(ic.id);
                            setIpCodes((prev) =>
                              prev.map((item) =>
                                item.id === ic.id ? { ...item, status: next } : item
                              )
                            );
                            showToast(`IP Code marked ${next}`, 'success');
                          }}
                          className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
                            ic.status === 'Active'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                              : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
                          }`}
                        >
                          {ic.status}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-400 tabular-nums">
                        {new Date(ic.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIpCode(ic);
                              setIpCodeModalOpen(true);
                            }}
                            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/15"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({
                                type: 'ipcode',
                                id: ic.id,
                                label: ic.code,
                              })
                            }
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: SUBMITTED CONNECTION REQUESTS */}
      {activeTab === 'requests' && (
        <section className="mt-5">
          {filteredRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0A0812] p-12 text-center">
              <p className="font-display text-base font-semibold text-white">
                No connection requests submitted yet
              </p>
              <p className="mt-1.5 text-sm text-slate-400">
                When users submit Country, IP Address, Redeem Code, and IP Code on the IndoXDPro
                portal, their submissions appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#0A0812]">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#06050B] text-xs font-medium text-slate-400">
                    <th className="px-5 py-3.5">Country</th>
                    <th className="px-4 py-3.5">IP Address</th>
                    <th className="px-4 py-3.5">Redeem Code</th>
                    <th className="px-4 py-3.5">IP Code</th>
                    <th className="px-4 py-3.5">Outcome</th>
                    <th className="px-4 py-3.5">Submitted</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <CountryFlag
                            countryName={req.countryName}
                            countryCode={req.countryCode}
                            flagMode="preset"
                            size="sm"
                          />
                          <span className="font-medium text-white">{req.countryName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-200">
                        {req.ipAddress}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-violet-300">
                        {req.redeemCode}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-300">
                        {req.ipCode}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs font-medium ${
                            req.resultStatus === 'Connected'
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {req.resultStatus}
                        </span>
                        <p className="max-w-[180px] truncate text-[11px] text-slate-500">
                          {req.statusReason}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
                        {new Date(req.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({
                              type: 'request',
                              id: req.id,
                              label: `${req.countryName} · ${req.ipAddress}`,
                            })
                          }
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* VPN Entry Add/Edit Modal */}
      <VpnFormModal
        isOpen={vpnModalOpen}
        editingServer={editingVpnAsServer}
        onClose={() => {
          setVpnModalOpen(false);
          setEditingVpnEntry(null);
        }}
        onSubmit={async (input: VpnServerInput) => {
          if (editingVpnEntry) {
            await updateAdminVpnEntry(editingVpnEntry.id, input);
            showToast('VPN entry updated', 'success', `${input.countryName} · ${input.ipAddress}`);
          } else {
            await createAdminVpnEntry(input);
            showToast('VPN entry added', 'success', `${input.countryName} · ${input.ipAddress}`);
          }
          await loadAllAdminData();
        }}
      />

      {/* Country Add/Edit Modal */}
      <CountryFormModal
        isOpen={countryModalOpen}
        editingCountry={editingCountry}
        onClose={() => {
          setCountryModalOpen(false);
          setEditingCountry(null);
        }}
        onSave={async (input: {
          name: string;
          code: string;
          flagMode: FlagMode;
          flagDataUrl: string;
          keywords?: string;
          isActive: boolean;
        }) => {
          if (editingCountry) {
            await updateAdminCountry(editingCountry.id, input);
            showToast('Country updated', 'success', input.name);
          } else {
            await createAdminCountry(input);
            showToast('Country added', 'success', input.name);
          }
          await loadAllAdminData();
        }}
      />

      {/* IP Code Add/Edit Modal */}
      <IpCodeModal
        isOpen={ipCodeModalOpen}
        editingIpCode={editingIpCode}
        onClose={() => {
          setIpCodeModalOpen(false);
          setEditingIpCode(null);
        }}
        onSave={async (input) => {
          if (editingIpCode) {
            await updateAdminIpCode(editingIpCode.id, input);
            showToast('IP Code updated', 'success', input.code);
          } else {
            await createAdminIpCode(input);
            showToast('IP Code added', 'success', input.code);
          }
          await loadAllAdminData();
        }}
      />

      {/* Redeem Code Add/Edit Modal */}
      <RedeemCodeModal
        isOpen={redeemModalOpen}
        editingCode={editingRedeem}
        onClose={() => {
          setRedeemModalOpen(false);
          setEditingRedeem(null);
        }}
        onSave={async (input) => {
          if (editingRedeem) {
            await updateAdminRedeemCode(editingRedeem.id, input);
            showToast('Redeem code updated', 'success', input.code);
          } else {
            await createAdminRedeemCode(input);
            showToast('Redeem code added', 'success', input.code);
          }
          await loadAllAdminData();
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title={
          deleteTarget?.type === 'vpn'
            ? 'Delete VPN Entry'
            : deleteTarget?.type === 'country'
              ? 'Delete Country'
              : deleteTarget?.type === 'ipcode'
                ? 'Delete IP Code'
                : deleteTarget?.type === 'redeem'
                  ? 'Delete Redeem Code'
                  : 'Delete Request Log'
        }
        description="This action permanently deletes the selected record from the server database."
        itemLabel={deleteTarget?.label ?? ''}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'vpn') {
            await deleteAdminVpnEntry(deleteTarget.id);
          } else if (deleteTarget.type === 'country') {
            await deleteAdminCountry(deleteTarget.id);
          } else if (deleteTarget.type === 'ipcode') {
            await deleteAdminIpCode(deleteTarget.id);
          } else if (deleteTarget.type === 'redeem') {
            await deleteAdminRedeemCode(deleteTarget.id);
          } else {
            await deleteAdminRequest(deleteTarget.id);
          }
          showToast('Entry deleted', 'info', deleteTarget.label);
          await loadAllAdminData();
        }}
      />
    </main>
  );
}
