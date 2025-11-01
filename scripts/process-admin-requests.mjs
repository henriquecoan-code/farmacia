#!/usr/bin/env node
// Process pending admin grant/revoke requests from Firestore and set custom claims
// Usage (PowerShell):
//   [Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS','C:\\path\\to\\serviceAccountKey.json','Process')
//   node scripts/process-admin-requests.mjs
// Optional flags:
//   --once   Process pending items once and exit (default)
//   --watch  Keep watching every N seconds (default 10s) for new requests
//   --interval 5   Set watch interval seconds

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

function parseArgs(){
  const args=process.argv.slice(2);
  const out={ once:true, watch:false, interval:10 };
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(a==='--watch'){ out.watch=true; out.once=false; continue; }
    if(a==='--once'){ out.once=true; out.watch=false; continue; }
    if(a==='--interval' && args[i+1]){ out.interval=Math.max(2, parseInt(args[++i],10)||10); continue; }
  }
  return out;
}

function ensureAdminInitialized(){
  if (admin.apps.length) return;
  try{
    const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if(!saPath){
      console.warn('[process-admin-requests] GOOGLE_APPLICATION_CREDENTIALS not set; attempting applicationDefault');
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      return;
    }
    const full = path.resolve(saPath);
    const json = JSON.parse(fs.readFileSync(full,'utf-8'));
    admin.initializeApp({ credential: admin.credential.cert(json) });
  }catch(e){
    console.error('[process-admin-requests] Failed to initialize Firebase Admin SDK:', e.message);
    process.exit(1);
  }
}

async function processPendingOnce(){
  const db = admin.firestore();
  const col = db.collection('adminRequests');
  const snapshot = await col.where('status','==','pending').orderBy('createdAtTs','asc').limit(20).get().catch(async ()=>{
    // Fallback if no index on createdAtTs
    return await col.where('status','==','pending').limit(20).get();
  });
  if (snapshot.empty){
    console.log('[process-admin-requests] No pending requests.');
    return 0;
  }
  let processed=0, failed=0;
  for (const doc of snapshot.docs){
    const data = doc.data() || {};
    const email = String(data.email||'').toLowerCase();
    const action = (data.action==='revoke') ? 'revoke' : 'grant';
    const id = doc.id;
    console.log(`→ Processing ${id}: ${action} admin for ${email}`);
    try{
      if(!email) throw new Error('Missing email');
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;
      const before = userRecord.customClaims || {};
      const newClaims = { ...before };
      if(action==='grant'){ newClaims.admin=true; newClaims.role='admin'; }
      else { delete newClaims.admin; if(newClaims.role==='admin') delete newClaims.role; }
      await admin.auth().setCustomUserClaims(uid, newClaims);
      await doc.ref.set({
        status: 'done',
        processedAt: new Date().toISOString(),
        result: action==='grant' ? 'granted' : 'revoked',
        uid,
        claimsBefore: before,
        claimsAfter: newClaims
      }, { merge: true });
      processed++;
      console.log(`✔ ${email}: ${action} ok`);
    }catch(e){
      failed++;
      console.error(`✖ ${email}: ${e.message}`);
      try{
        await doc.ref.set({ status:'failed', processedAt:new Date().toISOString(), error: e.message }, { merge:true });
      }catch{}
    }
  }
  console.log(`[process-admin-requests] Done. processed=${processed}, failed=${failed}`);
  return processed;
}

async function main(){
  const opts = parseArgs();
  ensureAdminInitialized();
  if (opts.once){
    await processPendingOnce();
    process.exit(0);
  }
  console.log(`[process-admin-requests] Watching every ${opts.interval}s... (Ctrl+C to stop)`);
  while(true){
    try { await processPendingOnce(); }
    catch(e){ console.error('[process-admin-requests] Loop error:', e.message); }
    await new Promise(r=> setTimeout(r, opts.interval*1000));
  }
}

main();
