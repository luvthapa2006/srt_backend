/**
 * fix-times-migration.js
 * 
 * Run this ONCE to fix existing schedules that were stored with the wrong UTC time.
 * 
 * THE BUG: Old code did `new Date(dateStr); depDate.setHours(hours, minutes, 0, 0);`
 * On a UTC server, setHours(17, 0) stores 17:00 UTC — which displays as 22:30 IST.
 * 
 * THE FIX: Subtract 5h30m (19800 seconds) from any departureTime where the UTC hour
 * does NOT align with a valid IST time (i.e., UTC hours are not offset by -5:30 from IST).
 * 
 * HOW TO RUN:
 *   node fix-times-migration.js
 * 
 * It will show you what it WOULD change, then ask for confirmation before updating.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Schedule = require('./models/Schedule');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bus-booking';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 19800000 ms

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const schedules = await Schedule.find({});
  console.log(`📋 Found ${schedules.length} schedules\n`);

  const toFix = [];

  for (const s of schedules) {
    const dep = new Date(s.departureTime);
    const utcHour   = dep.getUTCHours();
    const utcMinute = dep.getUTCMinutes();

    // If a schedule was stored with the bug, the UTC time equals what the admin
    // typed as IST. For example: admin typed 17:00, stored as 17:00 UTC.
    // A correctly stored 17:00 IST would be 11:30 UTC.
    //
    // We detect the bug by checking if (utcHour * 60 + utcMinute) is a "round" IST time
    // and NOT offset by 5:30. Since we can't be 100% sure without knowing original intent,
    // we check: does the IST representation make more sense than the UTC representation?
    //
    // Simpler heuristic: if adding IST offset (to get the displayed IST time) produces
    // a time that looks like the stored UTC time, then it was stored correctly.
    // If the UTC time looks like a human-entered time (e.g., 17:00, 8:00, 9:30),
    // and the IST display would be UTC+5:30 (22:30, 13:30, 15:00) which looks "weird",
    // then it's likely stored with the bug.
    //
    // Most reliable: we assume ALL times stored as exact-minute UTC values
    // that DON'T correspond to a :30 minute offset are potentially buggy.
    // (Because correct IST storage always has :30 minutes for whole-hour IST times,
    //  e.g., 17:00 IST = 11:30 UTC, 8:00 IST = 2:30 UTC, etc.)
    //
    // SAFE DETECTION: If utcMinutes is 0 (not :30), this was likely stored without IST offset.
    // This works for whole-hour IST departure times (most common case).
    // Schedules with :30 IST times (e.g., 17:30 IST = 12:00 UTC) are harder to detect automatically.

    const istDisplayHour = (utcHour + 5) % 24 + (utcMinute >= 30 ? 0 : 0);
    const istDisplayMin  = (utcMinute + 30) % 60;
    
    // If the stored UTC minutes is 0, it's almost certainly the bug
    // (real IST storage would have :30 minutes for whole-hour times)
    if (utcMinute === 0 && utcHour >= 0) {
      const fixedDep = new Date(dep.getTime() - IST_OFFSET_MS);
      const fixedArr = new Date(new Date(s.arrivalTime).getTime() - IST_OFFSET_MS);
      
      console.log(`🔴 NEEDS FIX: ${s.busName} | ${s.origin}→${s.destination}`);
      console.log(`   Stored: ${dep.toISOString()} (displays as ${dep.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'})} IST)`);
      console.log(`   Fixed:  ${fixedDep.toISOString()} (would display as ${fixedDep.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'})} IST)`);
      console.log();
      
      toFix.push({ id: s._id, fixedDep, fixedArr });
    }
  }

  if (toFix.length === 0) {
    console.log('✅ No schedules need fixing! All times appear correct.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\n⚠️  ${toFix.length} schedule(s) need to be fixed.`);
  console.log('The times above show what CURRENTLY displays (wrong) and what WOULD display (correct IST time).\n');

  // Auto-apply in non-interactive mode, or prompt
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    await applyFixes(toFix);
  } else {
    console.log('To apply these fixes, run:');
    console.log('  node fix-times-migration.js --apply\n');
    console.log('⚠️  WARNING: Only run this if you CONFIRM the schedules above have wrong times.');
    console.log('If your schedules are displaying correctly already, DO NOT run --apply.');
  }

  await mongoose.disconnect();
  console.log('✅ Done');
}

async function applyFixes(toFix) {
  console.log('Applying fixes...');
  for (const { id, fixedDep, fixedArr } of toFix) {
    await Schedule.findByIdAndUpdate(id, {
      departureTime: fixedDep,
      arrivalTime: fixedArr
    });
    console.log(`  ✅ Fixed schedule ${id}`);
  }
  console.log(`\n✅ Fixed ${toFix.length} schedule(s) successfully!`);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});