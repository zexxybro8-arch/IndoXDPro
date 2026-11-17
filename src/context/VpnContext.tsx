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
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../lib/firebase';
import { subscribePortalCountries } from '../lib/firestorePortal';
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
  signInWithGoogle: () => Promise<void>;
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

  // Firebase Auth & Verified Admin status check
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

  // Real-time admins list (only attached when authenticated as verified admin)
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
      showToast('Signed out from Admin Panel', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-out failed.';
      showToast('Unable to sign out', 'error', message);
    }
  }, [showToast]);

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
      signInWithGoogle,
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
      signInWithGoogle,
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
