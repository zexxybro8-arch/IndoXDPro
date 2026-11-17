import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Search, Upload, X } from 'lucide-react';
import { COUNTRY_OPTIONS } from '../lib/countries';
import { processFlagUpload } from '../lib/validation';
import { FlagMode, IpCodeEntry, ManagedCountry, RedeemCodeEntry, ServerStatus } from '../types/vpn';
import { CountryFlag } from './CountryFlag';

// --- Country Add/Edit Modal ---
interface CountryFormModalProps {
  isOpen: boolean;
  editingCountry: ManagedCountry | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    code: string;
    flagMode: FlagMode;
    flagDataUrl: string;
    keywords?: string;
    isActive: boolean;
  }) => Promise<void>;
}

export function CountryFormModal({
  isOpen,
  editingCountry,
  onClose,
  onSave,
}: CountryFormModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('US');
  const [flagMode, setFlagMode] = useState<FlagMode>('preset');
  const [flagDataUrl, setFlagDataUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [flagSearch, setFlagSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setFlagSearch('');
    if (editingCountry) {
      setName(editingCountry.name);
      setCode(editingCountry.code || 'US');
      setFlagMode(editingCountry.flagMode);
      setFlagDataUrl(editingCountry.flagDataUrl || '');
      setKeywords(editingCountry.keywords || '');
      setIsActive(editingCountry.isActive);
    } else {
      setName('');
      setCode('US');
      setFlagMode('preset');
      setFlagDataUrl('');
      setKeywords('');
      setIsActive(true);
    }
  }, [isOpen, editingCountry]);

  const filteredIso = useMemo(() => {
    const q = flagSearch.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [flagSearch]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await processFlagUpload(file);
      setFlagMode('upload');
      setCode('');
      setFlagDataUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload flag.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setError('Country name must be 2–80 characters.');
      return;
    }
    if (flagMode === 'preset' && !/^[A-Z]{2}(-[A-Z]{2,3})?$/.test(code.trim().toUpperCase())) {
      setError('Select a valid country flag.');
      return;
    }
    if (flagMode === 'upload' && !flagDataUrl) {
      setError('Please upload a flag image.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        code: flagMode === 'preset' ? code.trim().toUpperCase() : '',
        flagMode,
        flagDataUrl: flagMode === 'upload' ? flagDataUrl : '',
        keywords: keywords.trim(),
        isActive,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save country.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="country-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/12 bg-[#0E0C16] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <CountryFlag
              countryName={name || 'Country'}
              countryCode={code}
              flagMode={flagMode}
              flagDataUrl={flagDataUrl}
              size="sm"
            />
            <h2 id="country-modal-title" className="font-display text-lg font-semibold text-white">
              {editingCountry ? `Edit ${editingCountry.name}` : 'Add Country'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="cty-name" className="block text-xs font-medium text-slate-300">
                Country Name
              </label>
              <input
                id="cty-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Brazil"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300">Visibility</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#07060C] p-1">
                {[
                  { label: 'Active', val: true },
                  { label: 'Hidden', val: false },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setIsActive(opt.val)}
                    className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                      isActive === opt.val
                        ? opt.val
                          ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/40'
                          : 'bg-slate-700/40 text-slate-200 ring-1 ring-white/20'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="cty-keywords" className="block text-xs font-medium text-slate-300">
              Search Aliases <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="cty-keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. USA United States America"
              className="mt-1.5 min-h-[40px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Country Flag</span>
              <div className="inline-flex rounded-lg border border-white/10 bg-[#07060C] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setFlagMode('preset');
                    if (!code) setCode('US');
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    flagMode === 'preset' ? 'bg-violet-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Select Flag
                </button>
                <button
                  type="button"
                  onClick={() => setFlagMode('upload')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    flagMode === 'upload' ? 'bg-violet-600 text-white' : 'text-slate-400'
                  }`}
                >
                  Upload Flag
                </button>
              </div>
            </div>

            {flagMode === 'preset' ? (
              <div className="mt-2 rounded-xl border border-white/10 bg-[#07060C] p-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={flagSearch}
                    onChange={(e) => setFlagSearch(e.target.value)}
                    placeholder="Search flag..."
                    className="min-h-[36px] w-full rounded-lg border border-white/10 bg-[#0E0C16] pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div className="mt-2.5 grid max-h-36 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
                  {filteredIso.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setCode(c.code);
                        if (!name.trim()) setName(c.name);
                      }}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs ${
                        code === c.code
                          ? 'bg-violet-600/25 text-white ring-1 ring-violet-500/50'
                          : 'text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <CountryFlag
                        countryName={c.name}
                        countryCode={c.code}
                        flagMode="preset"
                        size="sm"
                      />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center rounded-xl border border-dashed border-white/15 bg-[#07060C] p-5 text-center">
                {flagDataUrl && (
                  <div className="mb-3">
                    <CountryFlag
                      countryName={name || 'Flag'}
                      countryCode=""
                      flagMode="upload"
                      flagDataUrl={flagDataUrl}
                      size="lg"
                    />
                  </div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{flagDataUrl ? 'Replace Flag' : 'Upload PNG/JPG/WebP/SVG'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[40px] rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-slate-300 hover:bg-white/[0.08]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="btn-purple-glow inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{editingCountry ? 'Save Country' : 'Add Country'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Redeem Code Add/Edit Modal ---
interface RedeemCodeModalProps {
  isOpen: boolean;
  editingCode: RedeemCodeEntry | null;
  onClose: () => void;
  onSave: (input: {
    code: string;
    balance: number;
    status: ServerStatus;
    expiryDate?: string;
    redemptionStatus?: 'Unused' | 'Redeemed';
    label?: string;
  }) => Promise<void>;
}

export function RedeemCodeModal({
  isOpen,
  editingCode,
  onClose,
  onSave,
}: RedeemCodeModalProps) {
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState('');
  const [status, setStatus] = useState<ServerStatus>('Active');
  const [expiryDate, setExpiryDate] = useState('');
  const [redemptionStatus, setRedemptionStatus] = useState<'Unused' | 'Redeemed'>('Unused');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingCode) {
      setCode(editingCode.code);
      setBalance(String(editingCode.balance ?? 0));
      setStatus(editingCode.status);
      setExpiryDate(editingCode.expiryDate || '');
      setRedemptionStatus(editingCode.redemptionStatus === 'Redeemed' ? 'Redeemed' : 'Unused');
      setLabel(editingCode.label || '');
    } else {
      setCode('');
      setBalance('');
      setStatus('Active');
      setExpiryDate('');
      setRedemptionStatus('Unused');
      setLabel('');
    }
  }, [isOpen, editingCode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!/^[a-zA-Z0-9_-]{2,64}$/.test(trimmedCode)) {
      setError('Redeem Code must be 2–64 chars using letters, numbers, - or _.');
      return;
    }

    const parsedBalance = Number(balance);
    if (balance.trim() === '' || !Number.isFinite(parsedBalance) || parsedBalance < 0) {
      setError('Balance must be a valid non-negative ₹ amount.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        code: trimmedCode,
        balance: Math.round(parsedBalance * 100) / 100,
        status,
        expiryDate: expiryDate.trim(),
        redemptionStatus: editingCode ? redemptionStatus : 'Unused',
        label: label.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save redeem code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="redeem-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0E0C16] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <h2 id="redeem-modal-title" className="font-display text-lg font-semibold text-white">
            {editingCode ? `Edit ${editingCode.code}` : 'Add Redeem Code'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rdm-code" className="block text-xs font-medium text-slate-300">
                Redeem Code
              </label>
              <input
                id="rdm-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. INDOX100"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="rdm-balance" className="block text-xs font-medium text-slate-300">
                Balance (₹)
              </label>
              <input
                id="rdm-balance"
                type="number"
                min={0}
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="e.g. 100"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-xs font-medium text-slate-300">Status</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#07060C] p-1">
                {(['Active', 'Inactive'] as ServerStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                      status === s
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
              <label htmlFor="rdm-expiry" className="block text-xs font-medium text-slate-300">
                Expiry Date <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="rdm-expiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-xs text-white focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {editingCode && (
            <div>
              <span className="block text-xs font-medium text-slate-300">Redemption Status</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#07060C] p-1">
                {(['Unused', 'Redeemed'] as const).map((rs) => (
                  <button
                    key={rs}
                    type="button"
                    onClick={() => setRedemptionStatus(rs)}
                    className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                      redemptionStatus === rs
                        ? rs === 'Unused'
                          ? 'bg-violet-600/30 text-violet-200 ring-1 ring-violet-500/45'
                          : 'bg-amber-600/25 text-amber-200 ring-1 ring-amber-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rs}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="rdm-label" className="block text-xs font-medium text-slate-300">
              Notes <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="rdm-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Campaign batch"
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[40px] rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-slate-300 hover:bg-white/[0.08]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-purple-glow inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{editingCode ? 'Save Changes' : 'Add Redeem Code'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- IP Code Add/Edit Modal ---
interface IpCodeModalProps {
  isOpen: boolean;
  editingIpCode: IpCodeEntry | null;
  onClose: () => void;
  onSave: (input: {
    code: string;
    label?: string;
    status: ServerStatus;
  }) => Promise<void>;
}

export function IpCodeModal({
  isOpen,
  editingIpCode,
  onClose,
  onSave,
}: IpCodeModalProps) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<ServerStatus>('Active');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingIpCode) {
      setCode(editingIpCode.code);
      setLabel(editingIpCode.label || '');
      setStatus(editingIpCode.status);
    } else {
      setCode('');
      setLabel('');
      setStatus('Active');
    }
  }, [isOpen, editingIpCode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!/^[a-zA-Z0-9_.:/-]{1,64}$/.test(trimmedCode)) {
      setError('IP Code must be 1–64 chars using letters, numbers, or . _ : / -');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        code: trimmedCode,
        label: label.trim(),
        status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save IP Code.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ipcode-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0E0C16] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <h2 id="ipcode-modal-title" className="font-display text-lg font-semibold text-white">
            {editingIpCode ? `Edit ${editingIpCode.code}` : 'Add IP Code'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="ipc-code" className="block text-xs font-medium text-slate-300">
              IP Code
            </label>
            <input
              id="ipc-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. US-8080-PRO"
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="ipc-label" className="block text-xs font-medium text-slate-300">
              Label / Description <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="ipc-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Primary US gateway node"
              className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300">Status</span>
            <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#07060C] p-1">
              {(['Active', 'Inactive'] as ServerStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                    status === s
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

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[40px] rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-slate-300 hover:bg-white/[0.08]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-purple-glow inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{editingIpCode ? 'Save Changes' : 'Add IP Code'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Generic Delete Confirmation Modal ---
interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  itemLabel: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteModal({
  title,
  description,
  itemLabel,
  isOpen,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0E0C16] p-6 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#07060C] px-4 py-3 font-mono text-sm text-white">
          {itemLabel}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-h-[40px] rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-slate-300 hover:bg-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}
