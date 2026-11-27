import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const KB_COLLECTION = "kb_chunks";
export const EVAL_COLLECTION = "eval_runs";

let _db: Firestore | null = null;

// Lazy init: only touch Firebase on the first real request, never at build/import
// time (where env vars may be absent).
export function getDb(): Firestore {
  if (_db) return _db;
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  _db = getFirestore();
  return _db;
}

