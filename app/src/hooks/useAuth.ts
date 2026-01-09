'use client';

import { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/firebase/config';

// Test mode: allows simulating multiple users in same browser
// Use ?testUser=1, ?testUser=2, etc. in URL to simulate different users
function getTestUserId(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const testUser = params.get('testUser');
  if (testUser) {
    return `test-user-${testUser}`;
  }
  return null;
}

// Create a fake user object for test mode
function createTestUser(testId: string): User {
  return {
    uid: testId,
    isAnonymous: true,
    emailVerified: false,
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({}) as any,
    reload: async () => {},
    toJSON: () => ({}),
    displayName: null,
    email: null,
    phoneNumber: null,
    photoURL: null,
    providerId: 'anonymous',
  } as User;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check for test mode
    const testUserId = getTestUserId();
    if (testUserId) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Test mode: Using test user ${testUserId}`);
      }
      setUser(createTestUser(testUserId));
      setLoading(false);
      return;
    }

    // Normal auth flow
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setLoading(false);
      } else {
        // Sign in anonymously
        signInAnonymously(auth)
          .then((result) => {
            setUser(result.user);
            setLoading(false);
          })
          .catch((err) => {
            console.error('Auth error:', err);
            setError(err);
            setLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading, error };
}
