import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
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
  where,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  handleFirestoreError,
} from '../lib/firebase';
import {
  ensureAdminProfileInFirestore,
  subscribePortalCountries,
} from '../lib/firestorePortal';
import { COUNTRY_OPTIONS } from '../lib/countries';
import { AdminRecord, ManagedCountry, ToastItem } from '../types/vpn';

interface VpnContextValue {
  portalCountries: ManagedCountry[];
  countriesLoading: boolean;
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  adminCheckLoading: boolean;
  admins: AdminRecord[];
  toasts: ToastItem[];
  showToast: (title: string, variant?: ToastItem['variant'], detail?: string) => void;
  dismissToast: (id: string) => void;
  signInWithAdminCredentials: (adminId: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  addAdmin: (uid: string, email: string) => Promise<void>;
  removeAdmin: (uid: string) => Promise<void>;
}

const VpnContext = createContext<VpnContextValue | null>(null);

const FALLBACK_COUNTRIES: ManagedCountry[] = COUNTRY_OPTIONS.map((c) => ({
  id: `cty_${c.code.toLowerCase()}`,
  name: c.name,
  code: c.code,
  keywords: c.keywords ?? '',
  flagMode: 'preset',
  flagDataUrl: '',
  isActive: true,
}));

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [portalCountries, setPortalCountries] = useState<ManagedCountry[]>(FALLBACK_COUNTRIES);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('indoxdpro_admin_active') === 'true';
    }
    return false;
  });
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

  // Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time active countries listener for the user homepage
  useEffect(() => {
    const unsubscribe = subscribePortalCountries(
      (list) => {
        setPortalCountries(list);
        setCountriesLoading(false);
      },
      () => {
        setCountriesLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time admins list (only attached when authenticated as admin)
  useEffect(() => {
    if (!isAdmin) {
      setAdmins([]);
      return;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'admins'), where('uid', '>=', '')),
      (snapshot) => {
        const list: AdminRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            uid: String(data.uid ?? d.id),
            email: String(data.email ?? 'admin@indoxdpro.local'),
            adminId: data.adminId ? String(data.adminId) : 'ADMIN551',
            displayName: data.displayName ? String(data.displayName) : 'IndoXDPro Administrator',
            role: 'SuperAdmin',
            isActive: true,
            addedBy: String(data.addedBy ?? 'system'),
            createdAt: data.createdAt ?? null,
          };
        });
        setAdmins(list);
      },
      () => {
        // Fallback admin record if collection is empty or restricted
        setAdmins([
          {
            uid: auth.currentUser?.uid ?? 'local_admin',
            email: 'admin@indoxdpro.local',
            adminId: 'ADMIN551',
            displayName: 'IndoXDPro Administrator',
            role: 'SuperAdmin',
            isActive: true,
            addedBy: 'system',
            createdAt: null,
          },
        ]);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const signInWithAdminCredentials = useCallback(
    async (adminIdInput: string, passwordInput: string) => {
      const trimmedId = adminIdInput.trim().toUpperCase();
      if (!trimmedId) {
        throw new Error('Please enter Admin ID.');
      }
      if (!passwordInput) {
        throw new Error('Please enter Admin Password.');
      }

      // Accept ADMIN or ADMIN551 as Admin ID, and ADMIN551 as Password
      const validId = trimmedId === 'ADMIN' || trimmedId === 'ADMIN551';
      const validPass = passwordInput === 'ADMIN551';

      if (!validId || !validPass) {
        throw new Error('Invalid Admin ID or password.');
      }

      setAdminCheckLoading(true);
      try {
        setIsAdmin(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('indoxdpro_admin_active', 'true');
        }

        showToast('Signed in to IndoXDPro Admin', 'success', trimmedId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign in.';
        throw new Error(message);
      } finally {
        setAdminCheckLoading(false);
      }
    },
    [showToast]
  );

  const signOutUser = useCallback(async () => {
    try {
      setIsAdmin(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('indoxdpro_admin_active');
      }
      await signOut(auth);
      showToast('Signed out from Admin Panel', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-out failed.';
      showToast('Unable to sign out', 'error', message);
    }
  }, [showToast]);

  const addAdmin = useCallback(
    async (uidInput: string, emailInput: string) => {
      if (!isAdmin) {
        throw new Error('Administrator authentication is required.');
      }
      const uid = uidInput.trim();
      const email = emailInput.trim().toLowerCase();

      const docRef = doc(db, 'admins', uid || `admin_${Date.now()}`);
      try {
        await setDoc(docRef, {
          uid: uid || `admin_${Date.now()}`,
          email: email || 'admin@indoxdpro.local',
          adminId: 'ADMIN551',
          role: 'SuperAdmin',
          isActive: true,
          addedBy: user?.uid ?? 'system',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('Administrator added', 'success', email || 'ADMIN551');
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'admins');
      }
    },
    [isAdmin, user, showToast]
  );

  const removeAdmin = useCallback(
    async (uid: string) => {
      if (!isAdmin) {
        throw new Error('Administrator authentication is required.');
      }
      const docRef = doc(db, 'admins', uid);
      try {
        await deleteDoc(docRef);
        showToast('Administrator removed', 'info');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
      }
    },
    [isAdmin, showToast]
  );

  const value = useMemo<VpnContextValue>(
    () => ({
      portalCountries,
      countriesLoading,
      user,
      authLoading,
      isAdmin,
      adminCheckLoading,
      admins,
      toasts,
      showToast,
      dismissToast,
      signInWithAdminCredentials,
      signOutUser,
      addAdmin,
      removeAdmin,
    }),
    [
      portalCountries,
      countriesLoading,
      user,
      authLoading,
      isAdmin,
      adminCheckLoading,
      admins,
      toasts,
      showToast,
      dismissToast,
      signInWithAdminCredentials,
      signOutUser,
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
