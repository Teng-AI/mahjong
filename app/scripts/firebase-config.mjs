import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local from the app directory
config({ path: resolve(__dirname, '..', '.env.local') });

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// Validate that all required config values are present
const requiredKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    console.error(`Missing required Firebase config: ${key}`);
    console.error('Make sure .env.local exists with NEXT_PUBLIC_FIREBASE_* variables');
    process.exit(1);
  }
}
