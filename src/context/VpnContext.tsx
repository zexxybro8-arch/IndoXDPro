import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../lib/firebase';
import { sanitizeVpnInput, validateVpnInput } from '../lib/validation';
import { AdminRecord, ServerStatus, ToastItem, VpnServer, VpnServerInput } from '../types/vpn';

interface VpnContextValue {
  servers: VpnServer[];
  serversLoading: boolean;
  serversError: string | null;
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  adminCheckLoading: boolean;
  admins: AdminRecord[];
  toasts: ToastItem[];
  showToast: (title: string, variant?: ToastItem['variant'], detail?: string) => void;
  dismissToast: (id: string) => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createServer: (input: VpnServerInput) => Promise<void>;
  updateServer: (id: string, input: VpnServerInput) => Promise<void>;
  toggleServerStatus: (id: string, currentStatus: ServerStatus) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  addAdmin: (uid: string, email: string) => Promise<void>;
  removeAdmin: (uid: string) => Promise<void>;
}

const VpnContext = createContext<VpnContextValue | null>(null);

function generateDocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [servers, setServers] = useState<VpnServer[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [serversError, setServersError] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (title: string, variant: ToastItem['variant'] = 'success', detail?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, variant, detail }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Auth & Admin status check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (!firebaseUser) {
        setIsAdmin(false);
        setAdmins([]);
        setAdminCheckLoading(false);
        return;
      }

      const isBootstrapped =
        firebaseUser.emailVerified && firebaseUser.email === BOOTSTRAPPED_ADMIN_EMAIL;

      if (isBootstrapped) {
        setIsAdmin(true);
        setAdminCheckLoading(false);
        return;
      }

      if (!firebaseUser.emailVerified) {
        setIsAdmin(false);
        setAdminCheckLoading(false);
        return;
      }

      setAdminCheckLoading(true);
      try {
        const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        setIsAdmin(adminSnap.exists());
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Real-time VPN servers listener (publicly readable; changes reflect instantly)
  useEffect(() => {
    const vpnQuery = query(
      collection(db, 'vpn_servers'),
      where('status', 'in', ['Active', 'Inactive'])
    );

    const unsubscribe = onSnapshot(
      vpnQuery,
      (snapshot) => {
        const next: VpnServer[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            countryName: String(data.countryName ?? ''),
            countryCode: String(data.countryCode ?? ''),
            flagMode: data.flagMode === 'upload' ? 'upload' : 'preset',
            flagDataUrl: String(data.flagDataUrl ?? ''),
            ipAddress: String(data.ipAddress ?? ''),
            ipCode: String(data.ipCode ?? ''),
            status: data.status === 'Inactive' ? 'Inactive' : 'Active',
            username: String(data.username ?? ''),
            password: String(data.password ?? ''),
            notes: String(data.notes ?? ''),
            createdBy: String(data.createdBy ?? ''),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });

        next.sort((a, b) => a.countryName.localeCompare(b.countryName));
        setServers(next);
        setServersLoading(false);
        setServersError(null);
      },
      (error) => {
        setServersLoading(false);
        setServersError('Unable to load VPN server directory.');
        handleFirestoreError(error, OperationType.LIST, 'vpn_servers');
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time admins list (only when signed in as verified admin)
  useEffect(() => {
    if (!user || !isAdmin) {
      setAdmins([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'admins'),
      (snapshot) => {
        const list: AdminRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid ?? d.id),
            email: String(data.email ?? ''),
            addedBy: String(data.addedBy ?? ''),
            createdAt: data.createdAt ?? null,
          };
        });
        setAdmins(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'admins');
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const verifiedAdminEmail =
          result.user.emailVerified && result.user.email === BOOTSTRAPPED_ADMIN_EMAIL;
        if (verifiedAdminEmail) {
          showToast('Signed in as Administrator', 'success', result.user.email ?? undefined);
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', result.user.uid));
          if (adminDoc.exists() && result.user.emailVerified) {
            showToast('Signed in as Administrator', 'success', result.user.email ?? undefined);
          } else {
            showToast(
              'Account signed in without admin privileges',
              'error',
              result.user.email ?? undefined
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed.';
      if (!message.includes('popup-closed-by-user')) {
        showToast('Authentication failed', 'error', message);
      }
    }
  }, [showToast]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      showToast('Signed out from Admin Console', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-out failed.';
      showToast('Unable to sign out', 'error', message);
    }
  }, [showToast]);

  const createServer = useCallback(
    async (rawInput: VpnServerInput) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }

      const { isValid, errors, sanitized } = validateVpnInput(rawInput);
      if (!isValid) {
        const firstError = Object.values(errors)[0] || 'Invalid input fields.';
        throw new Error(firstError);
      }

      const id = generateDocId();
      const docRef = doc(db, 'vpn_servers', id);
      try {
        await setDoc(docRef, {
          ...sanitized,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('VPN country added', 'success', `${sanitized.countryName} · ${sanitized.ipAddress}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `vpn_servers/${id}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const updateServer = useCallback(
    async (id: string, rawInput: VpnServerInput) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }

      const { isValid, errors, sanitized } = validateVpnInput(rawInput);
      if (!isValid) {
        const firstError = Object.values(errors)[0] || 'Invalid input fields.';
        throw new Error(firstError);
      }

      const docRef = doc(db, 'vpn_servers', id);
      try {
        await updateDoc(docRef, {
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
        showToast('VPN entry updated', 'success', `${sanitized.countryName} · ${sanitized.ipAddress}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `vpn_servers/${id}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const toggleServerStatus = useCallback(
    async (id: string, currentStatus: ServerStatus) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }

      const nextStatus: ServerStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      const docRef = doc(db, 'vpn_servers', id);
      try {
        await updateDoc(docRef, {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
        showToast(`Server marked ${nextStatus}`, 'success');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `vpn_servers/${id}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const deleteServer = useCallback(
    async (id: string) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }

      const docRef = doc(db, 'vpn_servers', id);
      try {
        await deleteDoc(docRef);
        showToast('VPN entry deleted', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `vpn_servers/${id}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const addAdmin = useCallback(
    async (uidInput: string, emailInput: string) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }
      const uid = uidInput.trim();
      const email = emailInput.trim().toLowerCase();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
        throw new Error('UID must be 1–128 alphanumeric, underscore, or hyphen characters.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
        throw new Error('Please enter a valid email address.');
      }

      const docRef = doc(db, 'admins', uid);
      try {
        await setDoc(docRef, {
          uid,
          email,
          addedBy: user.uid,
          createdAt: serverTimestamp(),
        });
        showToast('Administrator added', 'success', email);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `admins/${uid}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const removeAdmin = useCallback(
    async (uid: string) => {
      if (!user || !isAdmin) {
        throw new Error('Administrator authentication is required.');
      }
      if (uid === user.uid) {
        throw new Error('You cannot remove your own active admin access.');
      }

      const docRef = doc(db, 'admins', uid);
      try {
        await deleteDoc(docRef);
        showToast('Administrator removed', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
      }
    },
    [user, isAdmin, showToast]
  );

  const value = useMemo<VpnContextValue>(
    () => ({
      servers,
      serversLoading,
      serversError,
      user,
      authLoading,
      isAdmin,
      adminCheckLoading,
      admins,
      toasts,
      showToast,
      dismissToast,
      signInWithGoogle,
      signOutUser,
      createServer,
      updateServer,
      toggleServerStatus,
      deleteServer,
      addAdmin,
      removeAdmin,
    }),
    [
      servers,
      serversLoading,
      serversError,
      user,
      authLoading,
      isAdmin,
      adminCheckLoading,
      admins,
      toasts,
      showToast,
      dismissToast,
      signInWithGoogle,
      signOutUser,
      createServer,
      updateServer,
      toggleServerStatus,
      deleteServer,
      addAdmin,
      removeAdmin,
    ]
  );

  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const ctx = useContext(VpnContext);
  if (!ctx) {
    throw new Error('useVpn must be used within VpnProvider');
  }
  return ctx;
}

export { sanitizeVpnInput };
