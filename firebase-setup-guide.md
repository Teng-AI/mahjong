# Firebase Setup Guide

Step-by-step guide to set up Firebase for Fuzhou Mahjong (福州麻将).

---

## Step 1: Create Firebase Account & Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with a Google account
3. Click **"Create a project"**
4. Enter project name: `mahjong-vibe` (or similar)
5. Disable Google Analytics (not needed for this project)
6. Click **"Create project"**
7. Wait for project creation, then click **"Continue"**

---

## Step 2: Add a Web App

1. On the project overview page, click the **web icon** (`</>`)
2. Register app with nickname: `mahjong-web`
3. **Check** "Also set up Firebase Hosting" (optional but useful)
4. Click **"Register app"**
5. You'll see a config object like this — **save it**:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "mahjong-vibe.firebaseapp.com",
  databaseURL: "https://mahjong-vibe-default-rtdb.firebaseio.com",
  projectId: "mahjong-vibe",
  storageBucket: "mahjong-vibe.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Click **"Continue to console"**

---

## Step 3: Enable Realtime Database

1. In the left sidebar, click **"Build"** → **"Realtime Database"**
2. Click **"Create Database"**
3. Choose a location (pick closest to your users):
   - `us-central1` for US
   - `europe-west1` for Europe
   - `asia-southeast1` for Asia
4. Start in **"Test mode"** (we'll add proper rules later)
5. Click **"Enable"**

Your database URL will be something like:
```
https://mahjong-vibe-default-rtdb.firebaseio.com
```

---

## Step 4: Enable Anonymous Authentication

1. In the left sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Click **"Anonymous"**
5. Toggle **"Enable"** to ON
6. Click **"Save"**

This allows players to join games without creating accounts.

---

## Step 5: Set Up Security Rules

1. Go to **"Realtime Database"** → **"Rules"** tab
2. For **development**, use these simple rules:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

3. Click **"Publish"**

### Production Rules (for later)

When ready for production, use stricter rules:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": "auth != null",
        ".write": "auth != null && !data.exists()",

        "players": {
          "$seat": {
            ".write": "auth != null && (!data.exists() || data.child('id').val() == auth.uid)"
          }
        },

        "privateHands": {
          "$seat": {
            ".read": "auth != null && root.child('rooms').child($roomCode).child('players').child($seat).child('id').val() == auth.uid",
            ".write": "auth != null"
          }
        },

        "game": {
          ".write": "auth != null"
        },

        "settings": {
          ".write": "auth != null && data.parent().child('hostId').val() == auth.uid"
        },

        "status": {
          ".write": "auth != null"
        }
      }
    }
  }
}
```

---

## Step 6: Create Environment File

In your project, create `.env.local`:

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Important:** Add `.env.local` to `.gitignore` to keep keys private.

---

## Step 7: Install Firebase SDK

```bash
npm install firebase
```

---

## Step 8: Create Firebase Config File

Create `src/firebase/config.ts`:

```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (prevent re-initialization in dev)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getDatabase(app);
export const auth = getAuth(app);
export default app;
```

---

## Step 9: Create Auth Hook

Create `src/hooks/useAuth.ts`:

```typescript
import { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/firebase/config';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          .catch((error) => {
            console.error('Auth error:', error);
            setLoading(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}
```

---

## Verification Checklist

After setup, verify:

- [ ] Firebase project created
- [ ] Web app registered
- [ ] Realtime Database enabled
- [ ] Anonymous Auth enabled
- [ ] Security rules published
- [ ] `.env.local` created with config
- [ ] Firebase SDK installed
- [ ] Config file created

---

## Testing the Connection

Create a quick test to verify Firebase works:

```typescript
// Quick test in any component
import { ref, set, get } from 'firebase/database';
import { db } from '@/firebase/config';

async function testFirebase() {
  try {
    // Write test
    await set(ref(db, 'test'), { message: 'Hello Firebase!', timestamp: Date.now() });
    console.log('Write successful');

    // Read test
    const snapshot = await get(ref(db, 'test'));
    console.log('Read successful:', snapshot.val());

    return true;
  } catch (error) {
    console.error('Firebase test failed:', error);
    return false;
  }
}
```

---

## Common Issues

### "Permission denied" error
- Check that Anonymous Auth is enabled
- Verify security rules are published
- Make sure user is authenticated before database operations

### "Database URL not found"
- Ensure `databaseURL` is in your config
- Check the URL matches your Firebase console

### App not initializing
- Verify all environment variables are set
- Check for typos in `.env.local`
- Restart dev server after changing env vars

---

## Setup Complete ✅

**Project:** mahjong-vibe
**Database URL:** https://mahjong-vibe-default-rtdb.firebaseio.com
**App folder:** `/app`

### What's been set up:
- ✅ Firebase project created
- ✅ Realtime Database enabled
- ✅ Anonymous Authentication enabled
- ✅ Security rules configured (development mode)
- ✅ Next.js app scaffolded with TypeScript + Tailwind
- ✅ Firebase SDK installed and configured
- ✅ Auth hook created
- ✅ Connection tested and working

### Next Steps
Continue building Phase 2: Room System
