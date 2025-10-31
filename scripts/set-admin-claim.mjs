#!/usr/bin/env node
// Small helper to grant or revoke admin custom claims for a Firebase user
// Usage (PowerShell on Windows):
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
//   node scripts/set-admin-claim.mjs --email "admin@empresa.com"
//   node scripts/set-admin-claim.mjs --email "user@empresa.com" --unset

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { unset: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--email' && args[i+1]) { out.email = args[++i]; continue; }
    if (a === '--uid' && args[i+1]) { out.uid = args[++i]; continue; }
    if (a === '--unset') { out.unset = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

function printHelp() {
  console.log(`\nSet or unset Firebase admin custom claims for a user\n\n` +
`Required: set GOOGLE_APPLICATION_CREDENTIALS to your service account file.\n\n` +
`Examples (PowerShell):\n` +
`  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Users\\henri\\OneDrive\\Documentos\\Site\\farmaciasaobenedito-bcb2c-firebase-adminsdk-fbsvc-900dcdd43e.json"\n` +
`  node scripts/set-admin-claim.mjs --email "henriquecoan@gmail.com"\n` +
`  node scripts/set-admin-claim.mjs --email "henriquecoan@gmail.com" --unset\n`);
}

function ensureAdminInitialized() {
  if (admin.apps.length) return;
  try {
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!saPath) {
      console.warn('[set-admin-claim] GOOGLE_APPLICATION_CREDENTIALS not set; attempting applicationDefault');
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      return;
    }
    const full = path.resolve(saPath);
    const json = JSON.parse(fs.readFileSync(full, 'utf-8'));
    admin.initializeApp({ credential: admin.credential.cert(json) });
  } catch (e) {
    console.error('[set-admin-claim] Failed to initialize Firebase Admin SDK:', e.message);
    process.exit(1);
  }
}

async function main() {
  const { email, uid, unset, help } = parseArgs();
  if (help || (!email && !uid)) { printHelp(); process.exit(0); }
  ensureAdminInitialized();
  try {
    let userRecord = null;
    if (uid) userRecord = await admin.auth().getUser(uid);
    else userRecord = await admin.auth().getUserByEmail(email);
    const userUid = userRecord.uid;

    // Merge existing claims to avoid wiping unrelated flags
    const existing = (userRecord.customClaims || {});
    const newClaims = { ...existing };
    if (unset) {
      delete newClaims.admin;
      // only remove role if it was explicitly 'admin'
      if (newClaims.role === 'admin') delete newClaims.role;
    } else {
      newClaims.admin = true;
      newClaims.role = 'admin';
    }

    await admin.auth().setCustomUserClaims(userUid, newClaims);
    console.log(`✔ Claims updated for uid=${userUid} (${userRecord.email || 'no-email'})`);
    console.log('Current claims:', newClaims);
    console.log('\nImportant: The user must sign out and sign in again so the new claims take effect in the client.');
  } catch (e) {
    console.error('✖ Failed to update claims:', e.message);
    process.exit(1);
  }
}

main();
