import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, Search, Upload, X } from 'lucide-react';
import { COUNTRY_OPTIONS } from '../lib/countries';
import { FIELD_LIMITS, processFlagUpload, validateVpnInput } from '../lib/validation';
import { FlagMode, ServerStatus, ValidationErrors, VpnServer, VpnServerInput } from '../types/vpn';
import { CountryFlag } from './CountryFlag';

interface VpnFormModalProps {
  isOpen: boolean;
  editingServer: VpnServer | null;
  onClose: () => void;
  onSubmit: (input: VpnServerInput) => Promise<void>;
}

const INITIAL_INPUT: VpnServerInput = {
  countryName: '',
  countryCode: 'US',
  flagMode: 'preset',
  flagDataUrl: '',
  ipAddress: '',
  ipCode: '',
  status: 'Active',
  username: '',
  password: '',
  notes: '',
};

export function VpnFormModal({
  isOpen,
  editingServer,
  onClose,
  onSubmit,
}: VpnFormModalProps) {
  const [form, setForm] = useState<VpnServerInput>(INITIAL_INPUT);
  const [flagSearch, setFlagSearch] = useState('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingFlag, setUploadingFlag] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setSubmitError(null);
    setFlagSearch('');
    setShowPassword(false);

    if (editingServer) {
      setForm({
        countryName: editingServer.countryName,
        countryCode: editingServer.countryCode,
        flagMode: editingServer.flagMode,
        flagDataUrl: editingServer.flagDataUrl,
        ipAddress: editingServer.ipAddress,
        ipCode: editingServer.ipCode,
        status: editingServer.status,
        username: editingServer.username,
        password: editingServer.password,
        notes: editingServer.notes,
      });
    } else {
      setForm(INITIAL_INPUT);
    }
  }, [isOpen, editingServer]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, saving, onClose]);

  const filteredCountries = useMemo(() => {
    const q = flagSearch.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [flagSearch]);

  if (!isOpen) return null;

  const handleSelectPresetCountry = (code: string, name: string) => {
    setForm((prev) => ({
      ...prev,
      flagMode: 'preset',
      countryCode: code,
      flagDataUrl: '',
      countryName: prev.countryName.trim() === '' ? name : prev.countryName,
    }));
    setErrors((prev) => ({ ...prev, flag: undefined }));
  };

  const handleFlagModeChange = (mode: FlagMode) => {
    setForm((prev) => ({
      ...prev,
      flagMode: mode,
      countryCode: mode === 'preset' ? prev.countryCode || 'US' : '',
    }));
    setErrors((prev) => ({ ...prev, flag: undefined }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFlag(true);
    setErrors((prev) => ({ ...prev, flag: undefined }));
    try {
      const dataUrl = await processFlagUpload(file);
      setForm((prev) => ({
        ...prev,
        flagMode: 'upload',
        countryCode: '',
        flagDataUrl: dataUrl,
      }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        flag: err instanceof Error ? err.message : 'Failed to process flag image.',
      }));
    } finally {
      setUploadingFlag(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const validation = validateVpnInput(form);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await onSubmit(validation.sanitized);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save VPN entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vpn-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/12 bg-[#0E0C16] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <CountryFlag
              countryName={form.countryName || 'Preview'}
              countryCode={form.countryCode}
              flagMode={form.flagMode}
              flagDataUrl={form.flagDataUrl}
              size="sm"
            />
            <h2 id="vpn-modal-title" className="font-display text-xl font-semibold text-white">
              {editingServer ? `Edit ${editingServer.countryName}` : 'Add New VPN Country'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
          {submitError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
              {submitError}
            </div>
          )}

          {/* Country Name + Status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="vpn-country-name" className="block text-xs font-medium text-slate-300">
                Country Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="vpn-country-name"
                type="text"
                maxLength={FIELD_LIMITS.countryNameMax}
                value={form.countryName}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, countryName: e.target.value }));
                  setErrors((prev) => ({ ...prev, countryName: undefined }));
                }}
                placeholder="e.g. Germany - Frankfurt"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
              />
              {errors.countryName && (
                <p className="mt-1 text-xs text-rose-400">{errors.countryName}</p>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-300">Server Status</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/12 bg-[#07060C] p-1">
                {(['Active', 'Inactive'] as ServerStatus[]).map((statusOption) => {
                  const selected = form.status === statusOption;
                  return (
                    <button
                      key={statusOption}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, status: statusOption }))}
                      className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                        selected
                          ? statusOption === 'Active'
                            ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-slate-700/40 text-slate-200 ring-1 ring-white/20'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {statusOption}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Country Flag Selection or Upload */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-300">
                Country Flag <span className="text-rose-400">*</span>
              </span>
              <div className="inline-flex rounded-lg border border-white/10 bg-[#07060C] p-0.5">
                <button
                  type="button"
                  onClick={() => handleFlagModeChange('preset')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    form.flagMode === 'preset'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Select Flag
                </button>
                <button
                  type="button"
                  onClick={() => handleFlagModeChange('upload')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    form.flagMode === 'upload'
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload Custom Flag
                </button>
              </div>
            </div>

            {form.flagMode === 'preset' ? (
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
                    placeholder="Search country flag (e.g. Japan, US, Germany)..."
                    aria-label="Search preset country flags"
                    className="min-h-[36px] w-full rounded-lg border border-white/10 bg-[#0E0C16] pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <div className="mt-2.5 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3">
                  {filteredCountries.map((country) => {
                    const selected =
                      form.flagMode === 'preset' && form.countryCode === country.code;
                    return (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => handleSelectPresetCountry(country.code, country.name)}
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                          selected
                            ? 'bg-violet-600/25 text-white ring-1 ring-violet-500/60'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <CountryFlag
                          countryName={country.name}
                          countryCode={country.code}
                          flagMode="preset"
                          size="sm"
                        />
                        <span className="truncate">{country.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#07060C] p-5 text-center">
                {form.flagDataUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <CountryFlag
                      countryName={form.countryName || 'Uploaded flag'}
                      countryCode=""
                      flagMode="upload"
                      flagDataUrl={form.flagDataUrl}
                      size="lg"
                    />
                    <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10">
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Replace Flag Image</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/15 text-violet-400">
                      {uploadingFlag ? (
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-xs font-medium text-slate-200">
                      Click to upload PNG, JPG, WebP, or SVG flag
                    </span>
                    <span className="text-xs text-slate-500">
                      Automatically resized to crisp 3:2 thumbnail
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
            )}
            {errors.flag && <p className="mt-1 text-xs text-rose-400">{errors.flag}</p>}
          </div>

          {/* IP Address + IP Code */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vpn-ip-address" className="block text-xs font-medium text-slate-300">
                IP Address <span className="text-rose-400">*</span>
              </label>
              <input
                id="vpn-ip-address"
                type="text"
                maxLength={FIELD_LIMITS.ipAddressMax}
                value={form.ipAddress}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, ipAddress: e.target.value }));
                  setErrors((prev) => ({ ...prev, ipAddress: undefined }));
                }}
                placeholder="e.g. 185.220.101.14"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
              />
              {errors.ipAddress && (
                <p className="mt-1 text-xs text-rose-400">{errors.ipAddress}</p>
              )}
            </div>

            <div>
              <label htmlFor="vpn-ip-code" className="block text-xs font-medium text-slate-300">
                IP Code <span className="text-rose-400">*</span>
              </label>
              <input
                id="vpn-ip-code"
                type="text"
                maxLength={FIELD_LIMITS.ipCodeMax}
                value={form.ipCode}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, ipCode: e.target.value }));
                  setErrors((prev) => ({ ...prev, ipCode: undefined }));
                }}
                placeholder="e.g. DE-FRA-51820"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
              />
              {errors.ipCode && <p className="mt-1 text-xs text-rose-400">{errors.ipCode}</p>}
            </div>
          </div>

          {/* Optional Username + Password */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vpn-username" className="block text-xs font-medium text-slate-300">
                VPN Username <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="vpn-username"
                type="text"
                maxLength={FIELD_LIMITS.usernameMax}
                value={form.username}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, username: e.target.value }));
                  setErrors((prev) => ({ ...prev, username: undefined }));
                }}
                placeholder="Optional connection username"
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
              />
              {errors.username && <p className="mt-1 text-xs text-rose-400">{errors.username}</p>}
            </div>

            <div>
              <label htmlFor="vpn-password" className="block text-xs font-medium text-slate-300">
                VPN Password <span className="text-slate-500">(optional)</span>
              </label>
              <div className="relative mt-1.5">
                <input
                  id="vpn-password"
                  type={showPassword ? 'text' : 'password'}
                  maxLength={FIELD_LIMITS.passwordMax}
                  value={form.password}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, password: e.target.value }));
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Optional connection password"
                  className="min-h-[42px] w-full rounded-xl border border-white/12 bg-[#07060C] pl-3.5 pr-10 font-mono text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-400">{errors.password}</p>}
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="vpn-notes" className="block text-xs font-medium text-slate-300">
                Additional Notes <span className="text-slate-500">(optional)</span>
              </label>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {form.notes.length} / {FIELD_LIMITS.notesMax}
              </span>
            </div>
            <textarea
              id="vpn-notes"
              rows={3}
              maxLength={FIELD_LIMITS.notesMax}
              value={form.notes}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, notes: e.target.value }));
                setErrors((prev) => ({ ...prev, notes: undefined }));
              }}
              placeholder="Protocol instructions, DNS notes, or bandwidth guidelines..."
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-[#07060C] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
            />
            {errors.notes && <p className="mt-1 text-xs text-rose-400">{errors.notes}</p>}
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[42px] rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingFlag}
              className="btn-purple-glow inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              <span>{editingServer ? 'Save Changes' : 'Publish VPN Country'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
