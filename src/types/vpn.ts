import { Timestamp } from 'firebase/firestore';

export type ServerStatus = 'Active' | 'Inactive';
export type FlagMode = 'preset' | 'upload';

export interface VpnServer {
  id: string;
  countryName: string;
  countryCode: string;
  flagMode: FlagMode;
  flagDataUrl: string;
  ipAddress: string;
  ipCode: string;
  status: ServerStatus;
  username: string;
  password: string;
  notes: string;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VpnServerInput {
  countryName: string;
  countryCode: string;
  flagMode: FlagMode;
  flagDataUrl: string;
  ipAddress: string;
  ipCode: string;
  status: ServerStatus;
  username: string;
  password: string;
  notes: string;
}

export interface ManagedVpnEntry {
  id: string;
  countryName: string;
  countryCode: string;
  flagMode: FlagMode;
  flagDataUrl: string;
  ipAddress: string;
  ipCode: string;
  status: ServerStatus;
  username: string;
  password: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedCountry {
  id: string;
  name: string;
  code: string;
  keywords?: string;
  flagMode: FlagMode;
  flagDataUrl: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type RedemptionStatus = 'Unused' | 'Redeemed';

export interface RedeemCodeEntry {
  id: string;
  code: string;
  label: string;
  balance: number;
  expiryDate: string;
  redemptionStatus: RedemptionStatus;
  redeemedAt: string;
  maxUses: number;
  usedCount: number;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IpCodeEntry {
  id: string;
  code: string;
  label: string;
  status: ServerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionRequestLog {
  id: string;
  countryName: string;
  countryCode: string;
  ipAddress: string;
  redeemCode: string;
  ipCode: string;
  resultStatus: 'Connected' | 'Rejected';
  statusReason: string;
  createdAt: string;
}

export interface AdminRecord {
  uid: string;
  email: string;
  addedBy: string;
  createdAt: Timestamp | null;
}

export interface ValidationErrors {
  countryName?: string;
  flag?: string;
  ipAddress?: string;
  ipCode?: string;
  status?: string;
  username?: string;
  password?: string;
  notes?: string;
}

export interface ToastItem {
  id: string;
  title: string;
  detail?: string;
  variant: 'success' | 'error' | 'info';
}
