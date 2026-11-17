import { ValidationErrors, VpnServerInput } from '../types/vpn';

export const FIELD_LIMITS = {
  countryNameMin: 2,
  countryNameMax: 80,
  countryCodeMax: 10,
  flagDataUrlMax: 120000,
  ipAddressMin: 3,
  ipAddressMax: 64,
  ipCodeMin: 1,
  ipCodeMax: 64,
  usernameMax: 100,
  passwordMax: 100,
  notesMax: 500,
} as const;

const COUNTRY_CODE_PATTERN = /^([A-Z]{2}(-[A-Z]{2,3})?)?$/;
const IP_ADDRESS_CHARS_PATTERN = /^[a-zA-Z0-9.:-]+$/;
const IP_CODE_PATTERN = /^[a-zA-Z0-9_.:/-]+$/;
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  if (!/^[0-9a-fA-F:]+$/.test(value)) return false;
  const doubleColons = value.split('::');
  if (doubleColons.length > 2) return false;
  const groups = value.split(':').filter((g) => g.length > 0);
  if (doubleColons.length === 1 && groups.length !== 8) return false;
  if (doubleColons.length === 2 && groups.length > 7) return false;
  return groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g));
}

export function isStrictIpAddress(value: string): boolean {
  const trimmed = value.trim();
  return isValidIpv4(trimmed) || isValidIpv6(trimmed);
}

export interface PortalValidationErrors {
  country?: string;
  ipAddress?: string;
  redeemCode?: string;
  ipCode?: string;
}

const REDEEM_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validatePortalFields(input: {
  countryCode: string;
  ipAddress: string;
  redeemCode: string;
  ipCode: string;
}): { isValid: boolean; errors: PortalValidationErrors } {
  const errors: PortalValidationErrors = {};
  const ip = input.ipAddress.trim();
  const redeem = input.redeemCode.trim();
  const code = input.ipCode.trim();

  if (!input.countryCode.trim()) {
    errors.country = 'Please select a country.';
  }

  if (!ip) {
    errors.ipAddress = 'Please enter an IP address.';
  } else if (!isStrictIpAddress(ip)) {
    errors.ipAddress = 'Enter a valid IPv4 or IPv6 address (e.g. 185.220.101.14).';
  }

  if (!redeem) {
    errors.redeemCode = 'Please enter a redeem code.';
  } else if (redeem.length < 2 || redeem.length > 64 || !REDEEM_CODE_PATTERN.test(redeem)) {
    errors.redeemCode = 'Redeem Code must be 2–64 chars using letters, numbers, - or _.';
  }

  if (!code) {
    errors.ipCode = 'Please enter an IP code.';
  } else if (
    code.length > FIELD_LIMITS.ipCodeMax ||
    !IP_CODE_PATTERN.test(code)
  ) {
    errors.ipCode = 'IP Code must be 1–64 chars using letters, numbers, or . _ : / -';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function isValidHostnameOrIpv6(value: string): boolean {
  // Check IPv6-like syntax (contains at least two colons and hex segments)
  if (isValidIpv6(value)) {
    return true;
  }
  // If purely numeric and dots, require strict IPv4
  if (/^[\d.]+$/.test(value)) {
    return isValidIpv4(value);
  }
  // Hostname validation (e.g. de-fra-01.vpn.net)
  return /^(?=.{3,64}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    value
  );
}

export function sanitizeVpnInput(raw: VpnServerInput): VpnServerInput {
  const flagMode = raw.flagMode === 'upload' ? 'upload' : 'preset';
  return {
    countryName: raw.countryName.trim(),
    countryCode: flagMode === 'preset' ? raw.countryCode.trim().toUpperCase() : '',
    flagMode,
    flagDataUrl: flagMode === 'upload' ? raw.flagDataUrl.trim() : '',
    ipAddress: raw.ipAddress.trim(),
    ipCode: raw.ipCode.trim(),
    status: raw.status === 'Inactive' ? 'Inactive' : 'Active',
    username: raw.username.trim(),
    password: raw.password,
    notes: raw.notes.trim(),
  };
}

export function validateVpnInput(raw: VpnServerInput): {
  isValid: boolean;
  errors: ValidationErrors;
  sanitized: VpnServerInput;
} {
  const data = sanitizeVpnInput(raw);
  const errors: ValidationErrors = {};

  if (
    data.countryName.length < FIELD_LIMITS.countryNameMin ||
    data.countryName.length > FIELD_LIMITS.countryNameMax
  ) {
    errors.countryName = `Country name must be between ${FIELD_LIMITS.countryNameMin} and ${FIELD_LIMITS.countryNameMax} characters.`;
  }

  if (data.flagMode === 'preset') {
    if (
      !data.countryCode ||
      data.countryCode.length < 2 ||
      data.countryCode.length > FIELD_LIMITS.countryCodeMax ||
      !COUNTRY_CODE_PATTERN.test(data.countryCode)
    ) {
      errors.flag = 'Please select a valid country flag.';
    }
  } else {
    if (
      !data.flagDataUrl ||
      data.flagDataUrl.length < 20 ||
      data.flagDataUrl.length > FIELD_LIMITS.flagDataUrlMax ||
      !DATA_URL_PATTERN.test(data.flagDataUrl)
    ) {
      errors.flag = 'Please upload a valid PNG, JPG, WebP, or SVG flag under 90 KB.';
    }
  }

  if (
    data.ipAddress.length < FIELD_LIMITS.ipAddressMin ||
    data.ipAddress.length > FIELD_LIMITS.ipAddressMax ||
    !IP_ADDRESS_CHARS_PATTERN.test(data.ipAddress) ||
    (!isValidIpv4(data.ipAddress) && !isValidHostnameOrIpv6(data.ipAddress))
  ) {
    errors.ipAddress = 'Enter a valid IPv4, IPv6, or server hostname (e.g. 185.220.101.14).';
  }

  if (
    data.ipCode.length < FIELD_LIMITS.ipCodeMin ||
    data.ipCode.length > FIELD_LIMITS.ipCodeMax ||
    !IP_CODE_PATTERN.test(data.ipCode)
  ) {
    errors.ipCode = 'IP Code must be 1–64 chars using letters, numbers, or . _ : / -';
  }

  if (data.status !== 'Active' && data.status !== 'Inactive') {
    errors.status = 'Status must be Active or Inactive.';
  }

  if (data.username.length > FIELD_LIMITS.usernameMax) {
    errors.username = `Username cannot exceed ${FIELD_LIMITS.usernameMax} characters.`;
  }

  if (data.password.length > FIELD_LIMITS.passwordMax) {
    errors.password = `Password cannot exceed ${FIELD_LIMITS.passwordMax} characters.`;
  }

  if (data.notes.length > FIELD_LIMITS.notesMax) {
    errors.notes = `Additional notes cannot exceed ${FIELD_LIMITS.notesMax} characters.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitized: data,
  };
}

export async function processFlagUpload(file: File): Promise<string> {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Unsupported file type. Please upload PNG, JPG, WebP, or SVG.');
  }

  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    const base64 = btoa(unescape(encodeURIComponent(text)));
    const dataUrl = `data:image/svg+xml;base64,${base64}`;
    if (dataUrl.length > FIELD_LIMITS.flagDataUrlMax) {
      throw new Error('SVG flag is too large. Keep uploaded SVG files under 80 KB.');
    }
    return dataUrl;
  }

  // Raster image: resize cleanly to 120x80 via canvas to keep Firestore doc compact
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetW = 120;
        const targetH = 80;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        const scale = Math.max(targetW / img.width, targetH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offsetX = (targetW - drawW) / 2;
        const offsetY = (targetH - drawH) / 2;
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        const webpUrl = canvas.toDataURL('image/webp', 0.85);
        const finalUrl = webpUrl.startsWith('data:image/webp')
          ? webpUrl
          : canvas.toDataURL('image/png');

        if (finalUrl.length > FIELD_LIMITS.flagDataUrlMax) {
          reject(new Error('Compressed flag image exceeds 90 KB limit.'));
          return;
        }
        resolve(finalUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
