import React, { useState } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { Globe } from 'lucide-react';
import { FlagMode } from '../types/vpn';

interface CountryFlagProps {
  countryName: string;
  countryCode: string;
  flagMode: FlagMode;
  flagDataUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'w-7 h-5 rounded',
  md: 'w-11 h-7 rounded-md',
  lg: 'w-14 h-9 rounded-lg',
};

export function CountryFlag({
  countryName,
  countryCode,
  flagMode,
  flagDataUrl,
  size = 'md',
}: CountryFlagProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (flagMode === 'upload' && flagDataUrl && !imgError) {
    return (
      <div
        className={`${sizeClass} relative shrink-0 overflow-hidden border border-white/15 bg-[#161326]`}
      >
        <img
          src={flagDataUrl}
          alt={`${countryName} flag`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const normalizedCode = countryCode.trim().toUpperCase();
  const FlagSvg = normalizedCode
    ? (Flags as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[normalizedCode]
    : undefined;

  if (FlagSvg) {
    return (
      <div
        className={`${sizeClass} relative shrink-0 overflow-hidden border border-white/15 bg-[#161326]`}
      >
        <FlagSvg
          aria-label={`${countryName} flag`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center border border-violet-500/30 bg-gradient-to-br from-violet-950/80 to-[#141122] text-violet-300`}
      aria-label={`${countryName} flag placeholder`}
    >
      {normalizedCode ? (
        <span className="font-mono text-[10px] font-semibold tracking-wider">
          {normalizedCode.slice(0, 2)}
        </span>
      ) : (
        <Globe className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </div>
  );
}
