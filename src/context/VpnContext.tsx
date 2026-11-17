import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
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
  handleFirestoreError,
} from '../lib/firebase';
import {
  ensureAdminProfileInFirestore,
  resolveAdminAuthEmail,
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
  sendAdminVerificationEmail: () => Promise<void>;
  refreshAdminSession: () => Promise<boolean>;
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

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Invalid Admin ID or password.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please wait a moment and try again.';
    case 'auth/user-disabled':
      return 'This administrator account has been disabled in Firebase Authentication.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Authentication yet. Enable Email/Password in Firebase Console → Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error while verifying credentials. Check your internet connection.';
    default:
      return error instanceof Error ? error.message : 'Unable to authenticate administrator.';
  }
}

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [portalCountries, setPortalCountries] = useState<ManagedCountry[]>(FALLBACK_COUNTRIES);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const lastAdminIdRef = useRef<string>('');

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

  const evaluateAdminStatus = useCallback(async (firebaseUser: User | null): Promise<boolean> => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setIsAdmin(false);
      setAdminCheckLoading(false);
      return false;
    }

    const isBootstrapped =
      (firebaseUser.email ?? '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

    if (isBootstrapped) {
      setIsAdmin(true);
      setAdminCheckLoading(false);
      void ensureAdminProfileInFirestore(firebaseUser, lastAdminIdRef.current);
      return true;
    }

    setAdminCheckLoading(true);
    try {
      const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
      const allowed = adminSnap.exists() && adminSnap.data()?.isActive !== false;
      setIsAdmin(allowed);
      if (allowed) {
        void ensureAdminProfileInFirestore(firebaseUser, lastAdminIdRef.current);
      }
      return allowed;
    } catch {
      setIsAdmin(false);
      return false;
    } finally {
      setAdminCheckLoading(false);
    }
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

      await evaluateAdminStatus(firebaseUser);
    });

    return () => unsubscribe();
  }, [evaluateAdminStatus]);

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
            adminId: data.adminId ? String(data.adminId) : undefined,
            displayName: data.displayName ? String(data.displayName) : undefined,
            role: data.role === 'SuperAdmin' ? 'SuperAdmin' : 'Admin',
            isActive: data.isActive !== false,
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

  const signInWithAdminCredentials = useCallback(
    async (adminIdInput: string, passwordInput: string) => {
      const trimmedId = adminIdInput.trim();
      if (!trimmedId) {
        throw new Error('Please enter your Admin ID.');
      }
      if (!passwordInput) {
        throw new Error('Please enter your Admin Password.');
      }

      const { adminId, authEmail } = await resolveAdminAuthEmail(trimmedId);
      lastAdminIdRef.current = adminId;

      try {
        const credential = await signInWithEmailAndPassword(auth, authEmail, passwordInput);
        const signedUser = credential.user;
        if (!signedUser.emailVerified) {
          showToast(
            'Email verification required',
            'info',
            'Verify your admin email to unlock Firestore write access.'
          );
          return;
        }

        const allowed = await evaluateAdminStatus(signedUser);
        if (allowed) {
          showToast('Signed in to IndoXDPro Admin', 'success', adminId);
        } else {
          showToast(
            'Account signed in without admin privileges',
            'error',
            signedUser.email ?? undefined
          );
        }
      } catch (error) {
        const friendly = mapFirebaseAuthError(error);
        throw new Error(friendly);
      }
    },
    [evaluateAdminStatus, showToast]
  );

  const sendAdminVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('No signed-in account found.');
    }
    try {
      await sendEmailVerification(auth.currentUser);
      showToast(
        'Verification email sent',
        'success',
        auth.currentUser.email ?? 'Check your inbox.'
      );
    } catch (error) {
      const message = mapFirebaseAuthError(error);
      showToast('Could not send verification email', 'error', message);
      throw new Error(message);
    }
  }, [showToast]);

  const refreshAdminSession = useCallback(async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshedUser = auth.currentUser;
    setUser(refreshedUser);
    const allowed = await evaluateAdminStatus(refreshedUser);
    if (allowed) {
      showToast('Administrator session verified', 'success', refreshedUser.email ?? undefined);
    } else if (!refreshedUser.emailVerified) {
      showToast(
        'Email is not verified yet',
        'error',
        'Click the verification link sent to your email first.'
      );
    }
    return allowed;
  }, [evaluateAdminStatus, showToast]);

  const signOutUser = useCallback(async () => {
    try {
      lastAdminIdRef.current = '';
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
          role: 'Admin',
          isActive: true,
          addedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
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
      signInWithAdminCredentials,
      sendAdminVerificationEmail,
      refreshAdminSession,
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
      sendAdminVerificationEmail,
      refreshAdminSession,
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
