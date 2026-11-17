import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  Network,
  Shield,
  ShieldCheck,
  Ticket,
  Wallet,
  X,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import {
  submitPortalConnection,
  verifyPortalIpCode,
  verifyPortalRedeemCode,
} from '../lib/firestorePortal';
import { PortalValidationErrors, validatePortalFields } from '../lib/validation';
import { CountrySelect, SelectableCountry } from './CountrySelect';

type RedeemVerifyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'valid'; code: string; balance: number }
  | { status: 'invalid'; error: string; reason?: string };

type IpCodeVerifyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'valid'; code: string }
  | { status: 'invalid'; reason?: string };

function formatInr(amount: number): string {
  return Number.isInteger(amount)
    ? amount.toLocaleString('en-IN')
    : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VpnPortal() {
  const { portalCountries, showToast } = useVpn();

  const countries = portalCountries;
  const [selectedCountry, setSelectedCountry] = useState<SelectableCountry | null>(null);
  const [ipAddress, setIpAddress] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [ipCode, setIpCode] = useState('');
  const [errors, setErrors] = useState<PortalValidationErrors>({});
  const [connecting, setConnecting] = useState(false);
  const [redeemVerify, setRedeemVerify] = useState<RedeemVerifyState>({ status: 'idle' });
  const verifySeqRef = useRef(0);
  const [ipCodeVerify, setIpCodeVerify] = useState<IpCodeVerifyState>({ status: 'idle' });
  const ipVerifySeqRef = useRef(0);

  const [connectedEndpoint, setConnectedEndpoint] = useState<{
    countryName: string;
    ipAddress: string;
    redeemCode: string;
    ipCode: string;
    balance: number;
  } | null>(null);

  useEffect(() => {
    if (!selectedCountry) return;
    const stillActive = countries.find(
      (c) =>
        (c.id && selectedCountry.id && c.id === selectedCountry.id) ||
        (c.code && selectedCountry.code && c.code === selectedCountry.code) ||
        c.name === selectedCountry.name
    );
    if (!stillActive) {
      setSelectedCountry(null);
    }
  }, [countries, selectedCountry]);

  const runRedeemVerification = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) {
      verifySeqRef.current += 1;
      setRedeemVerify({ status: 'idle' });
      return;
    }

    const seq = ++verifySeqRef.current;
    setRedeemVerify({ status: 'checking' });

    try {
      const res = await verifyPortalRedeemCode(trimmed);
      if (seq !== verifySeqRef.current) return;

      if (res.valid) {
        setRedeemVerify({
          status: 'valid',
          code: res.code ?? trimmed,
          balance: Number(res.balance ?? 0),
        });
        setErrors((prev) => ({ ...prev, redeemCode: undefined }));
      } else {
        setRedeemVerify({
          status: 'invalid',
          error: res.error || 'INVALID REDEEM CODE',
          reason: res.reason,
        });
      }
    } catch {
      if (seq !== verifySeqRef.current) return;
      setRedeemVerify({
        status: 'invalid',
        error: 'INVALID REDEEM CODE',
        reason: 'Unable to verify redeem code.',
      });
    }
  };

  // Debounced live verification when user types a Redeem Code
  useEffect(() => {
    const trimmed = redeemCode.trim();
    if (!trimmed) {
      verifySeqRef.current += 1;
      setRedeemVerify({ status: 'idle' });
      return;
    }

    if (trimmed.length < 2) {
      verifySeqRef.current += 1;
      setRedeemVerify({ status: 'idle' });
      return;
    }

    const timer = window.setTimeout(() => {
      void runRedeemVerification(trimmed);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [redeemCode]);

  const runIpCodeVerification = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) {
      ipVerifySeqRef.current += 1;
      setIpCodeVerify({ status: 'idle' });
      return;
    }

    const seq = ++ipVerifySeqRef.current;
    setIpCodeVerify({ status: 'checking' });

    try {
      const res = await verifyPortalIpCode(trimmed);
      if (seq !== ipVerifySeqRef.current) return;

      if (res.valid) {
        setIpCodeVerify({
          status: 'valid',
          code: res.code ?? trimmed,
        });
        setErrors((prev) => ({ ...prev, ipCode: undefined }));
      } else {
        setIpCodeVerify({
          status: 'invalid',
          reason: res.reason,
        });
      }
    } catch {
      if (seq !== ipVerifySeqRef.current) return;
      setIpCodeVerify({
        status: 'invalid',
        reason: 'Unable to verify IP Code.',
      });
    }
  };

  // Debounced live verification when user types an IP Code
  useEffect(() => {
    const trimmed = ipCode.trim();
    if (!trimmed) {
      ipVerifySeqRef.current += 1;
      setIpCodeVerify({ status: 'idle' });
      return;
    }

    const timer = window.setTimeout(() => {
      void runIpCodeVerification(trimmed);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ipCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validatePortalFields({
      countryCode: selectedCountry?.code || selectedCountry?.name || '',
      ipAddress,
      redeemCode,
      ipCode,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      const firstError =
        validation.errors.country ||
        validation.errors.ipAddress ||
        validation.errors.redeemCode ||
        validation.errors.ipCode ||
        'Please check all four fields.';
      showToast('Validation failed', 'error', firstError);
      return;
    }

    setErrors({});
    setConnecting(true);

    try {
      const cleanIp = ipAddress.trim();
      const cleanRedeem = redeemCode.trim();
      const cleanCode = ipCode.trim();
      const countryName = selectedCountry?.name ?? '';
      const countryCode = selectedCountry?.code || countryName.slice(0, 2).toUpperCase();

      // Atomically verify IP Code & Redeem Code and redeem via Firestore transaction
      const connection = await submitPortalConnection({
        countryCode,
        countryName,
        ipAddress: cleanIp,
        redeemCode: cleanRedeem,
        ipCode: cleanCode,
      });

      setConnectedEndpoint({
        countryName: connection.countryName,
        ipAddress: connection.ipAddress,
        redeemCode: connection.redeemCode,
        ipCode: connection.ipCode,
        balance: Number(connection.balance ?? 0),
      });
      verifySeqRef.current += 1;
      setRedeemVerify({ status: 'idle' });

      showToast(
        `Connected to ${connection.countryName}`,
        'success',
        `${connection.ipAddress} · ${connection.redeemCode} · ₹${formatInr(
          Number(connection.balance ?? 0)
        )}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to connect VPN.';
      setConnectedEndpoint(null);
      if (
        message.toUpperCase().includes('REDEEM') ||
        message.toLowerCase().includes('redeemed')
      ) {
        setRedeemVerify({
          status: 'invalid',
          error: 'INVALID REDEEM CODE',
          reason: message === 'INVALID REDEEM CODE' ? undefined : message,
        });
      }
      if (message.toUpperCase().includes('IP CODE')) {
        setIpCodeVerify({
          status: 'invalid',
          reason: message,
        });
      }
      showToast('Connection failed', 'error', message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    const prev = connectedEndpoint;
    setConnectedEndpoint(null);
    if (prev) {
      showToast('VPN Disconnected', 'info', `${prev.countryName} · ${prev.ipAddress}`);
    }
  };

  return (
    <main className="relative flex min-h-[calc(100vh-8rem)] w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {/* Subtle Ambient Purple Glow Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-700/18 blur-[120px]"
      />

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        aria-label="VPN Connection Portal"
        className="relative w-full max-w-[460px]"
      >
        <div className="rounded-3xl border border-violet-500/25 bg-[#0A0812]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_50px_rgba(124,58,237,0.14)] backdrop-blur-xl sm:p-8">
          {/* Minimal Portal Brand Header */}
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/35 bg-violet-600/15 text-violet-300 shadow-[0_0_24px_rgba(139,92,246,0.28)]">
              <Shield className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-[26px]">
              IndoXDPro
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Select a country and enter your endpoint credentials to connect.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* 1. Country Select */}
            <CountrySelect
              value={selectedCountry?.id ?? selectedCountry?.code ?? selectedCountry?.name ?? ''}
              countries={countries}
              disabled={connecting}
              error={errors.country}
              onChange={(country) => {
                setSelectedCountry(country);
                setErrors((prev) => ({ ...prev, country: undefined }));
              }}
            />

            {/* 2. IP Address */}
            <div>
              <label
                htmlFor="portal-ip-address"
                className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
              >
                IP Address
              </label>
              <div
                data-invalid={errors.ipAddress ? 'true' : 'false'}
                className="portal-input-box flex min-h-[58px] items-center gap-3 rounded-2xl px-4"
              >
                <Network className="h-5 w-5 shrink-0 text-violet-400/80" aria-hidden="true" />
                <input
                  id="portal-ip-address"
                  type="text"
                  value={ipAddress}
                  disabled={connecting}
                  onChange={(e) => {
                    setIpAddress(e.target.value);
                    setErrors((prev) => ({ ...prev, ipAddress: undefined }));
                  }}
                  placeholder="Enter IP Address"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-full w-full bg-transparent py-3 font-mono text-base text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none"
                />
              </div>
              {errors.ipAddress && (
                <p className="mt-1.5 text-xs text-rose-400">{errors.ipAddress}</p>
              )}
            </div>

            {/* 3. REDEEM CODE */}
            <div>
              <label
                htmlFor="portal-redeem-code"
                className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
              >
                REDEEM CODE
              </label>
              <div
                data-valid={redeemVerify.status === 'valid' ? 'true' : 'false'}
                data-invalid={
                  errors.redeemCode || redeemVerify.status === 'invalid' ? 'true' : 'false'
                }
                className="portal-input-box flex min-h-[58px] items-center gap-2.5 rounded-2xl px-3.5 sm:gap-3 sm:px-4"
              >
                <Ticket className="h-5 w-5 shrink-0 text-violet-400/80" aria-hidden="true" />
                <input
                  id="portal-redeem-code"
                  type="text"
                  value={redeemCode}
                  disabled={connecting}
                  onChange={(e) => {
                    verifySeqRef.current += 1;
                    setRedeemVerify({ status: 'idle' });
                    setRedeemCode(e.target.value);
                    setErrors((prev) => ({ ...prev, redeemCode: undefined }));
                  }}
                  onBlur={() => {
                    const trimmed = redeemCode.trim();
                    if (trimmed.length >= 2) {
                      void runRedeemVerification(trimmed);
                    }
                  }}
                  placeholder="Enter Redeem Code"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent py-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none sm:text-base"
                />

                {redeemVerify.status === 'checking' && (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-violet-400"
                    aria-label="Verifying redeem code"
                  />
                )}

                {redeemVerify.status === 'valid' && (
                  <span
                    role="status"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-emerald-400 sm:text-[13px]"
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[#050409]">
                      <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                    </span>
                    <span>Verified</span>
                  </span>
                )}

                {redeemVerify.status === 'invalid' && (
                  <span
                    role="alert"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-rose-400 sm:text-[13px]"
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[#050409]">
                      <X className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                    </span>
                    <span>Invalid</span>
                  </span>
                )}
              </div>

              {errors.redeemCode && (
                <p className="mt-1.5 text-xs text-rose-400">{errors.redeemCode}</p>
              )}

              {redeemVerify.status === 'valid' && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#07050D] px-3.5 py-2 text-xs sm:text-[13px]">
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span className="text-slate-300">Available Balance:</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    ₹{formatInr(redeemVerify.balance)}
                  </span>
                </div>
              )}
            </div>

            {/* 4. IP Code */}
            <div>
              <label
                htmlFor="portal-ip-code"
                className="mb-2 block text-xs font-semibold tracking-wider text-violet-200/80"
              >
                IP Code
              </label>
              <div
                data-valid={ipCodeVerify.status === 'valid' ? 'true' : 'false'}
                data-invalid={
                  errors.ipCode || ipCodeVerify.status === 'invalid' ? 'true' : 'false'
                }
                className="portal-input-box flex min-h-[58px] items-center gap-2.5 rounded-2xl px-3.5 sm:gap-3 sm:px-4"
              >
                <KeyRound className="h-5 w-5 shrink-0 text-violet-400/80" aria-hidden="true" />
                <input
                  id="portal-ip-code"
                  type="text"
                  value={ipCode}
                  disabled={connecting}
                  onChange={(e) => {
                    ipVerifySeqRef.current += 1;
                    setIpCodeVerify({ status: 'idle' });
                    setIpCode(e.target.value);
                    setErrors((prev) => ({ ...prev, ipCode: undefined }));
                  }}
                  onBlur={() => {
                    const trimmed = ipCode.trim();
                    if (trimmed.length >= 1) {
                      void runIpCodeVerification(trimmed);
                    }
                  }}
                  placeholder="Enter IP Code"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent py-3 font-mono text-sm text-white placeholder:font-sans placeholder:text-slate-500 focus:outline-none sm:text-base"
                />

                {ipCodeVerify.status === 'checking' && (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-violet-400"
                    aria-label="Verifying IP code"
                  />
                )}

                {ipCodeVerify.status === 'valid' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    role="status"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-emerald-400 sm:text-[13px]"
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[#050409]">
                      <Check className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                    </span>
                    <span>Verified</span>
                  </motion.span>
                )}

                {ipCodeVerify.status === 'invalid' && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    role="alert"
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-rose-400 sm:text-[13px]"
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[#050409]">
                      <X className="h-2.5 w-2.5 stroke-[3]" aria-hidden="true" />
                    </span>
                    <span>Not Verified</span>
                  </motion.span>
                )}
              </div>
              {errors.ipCode && (
                <p className="mt-1.5 text-xs text-rose-400">{errors.ipCode}</p>
              )}
            </div>

            {/* Connect Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={connecting}
                className="btn-purple-glow flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-2xl px-6 text-base font-bold tracking-wide text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>CONNECTING...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <span>CONNECT VPN</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Compact Connected Status Feedback (only shown after user connects) */}
          {connectedEndpoint && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 px-4 py-3 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2.5 text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate font-medium tabular-nums">
                  Connected · {connectedEndpoint.countryName} ({connectedEndpoint.ipAddress}) · ₹
                  {formatInr(connectedEndpoint.balance)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="shrink-0 font-semibold text-slate-300 transition-colors hover:text-white"
              >
                Disconnect
              </button>
            </motion.div>
          )}
        </div>
      </motion.section>
    </main>
  );
}
