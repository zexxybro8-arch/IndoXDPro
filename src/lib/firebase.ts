import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'hip-chiller-25v9p',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:862745783879:web:a504c7162881966dcdcb62',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAyE08Mz9xl-0i8vnbU2wYYmWywalbG84E',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'hip-chiller-25v9p.firebaseapp.com',
  firestoreDatabaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID || 'ai-studio-d2f9941b-3dca-468f-ab87-0c3a7b331e33',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'hip-chiller-25v9p.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '862745783879',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const PRIMARY_ADMIN_ID = 'ADMIN551';
export const BOOTSTRAPPED_ADMIN_EMAIL =
  (import.meta.env.VITE_ADMIN_AUTH_EMAIL as string | undefined)?.trim() ||
  'zexxybro8@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'countries', 'connection_check'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
