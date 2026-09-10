/* MV3 service worker — keeps the toolbar badge in sync and relays timer
   transitions to the RPCs. It never computes hours (the DB does) and it can be
   killed at any time: chrome.alarms (1 min) wakes it to refresh the badge, and
   the DB row is the source of truth on every wake. */
import { supabase, timeLogs } from './supabase.js';
import { elapsedMs } from '../../src/api/timeLogs.js';

const BRAND = '#121317';   // DS --accent (charcoal) — white badge text reads on it
const PAUSED = '#F59E0B';  // DS --yellow

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

export async function refreshBadge() {
  try {
    const uid = await currentUserId();
    const open = uid ? await timeLogs.fetchMyOpenTimeLog(uid) : null;
    if (!open) { await chrome.action.setBadgeText({ text: '' }); return; }
    const mins = Math.floor(elapsedMs(open) / 60000);
    await chrome.action.setBadgeBackgroundColor({ color: open.status === 'running' ? BRAND : PAUSED });
    await chrome.action.setBadgeText({
      text: open.status === 'running' ? (mins < 1 ? 'ON' : String(Math.min(mins, 999))) : 'II',
    });
  } catch {
    await chrome.action.setBadgeText({ text: '' });
  }
}

function arm() {
  chrome.alarms.create('gq-tick', { periodInMinutes: 1 });
  refreshBadge();
}
chrome.runtime.onInstalled.addListener(arm);
chrome.runtime.onStartup.addListener(arm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'gq-tick') refreshBadge(); });

// message router: popup → worker → RPC. Every transition refreshes the badge.
chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  (async () => {
    try {
      let data;
      switch (msg?.type) {
        case 'start':   data = await timeLogs.startTimeLog(msg.payload); break;
        case 'pause':   data = await timeLogs.pauseTimeLog(msg.id); break;
        case 'resume':  data = await timeLogs.resumeTimeLog(msg.id); break;
        case 'stop':    data = await timeLogs.stopTimeLog(msg.id, msg.note); break;
        case 'discard': data = await timeLogs.discardTimeLog(msg.id); break;
        case 'refreshBadge': data = true; break;
        default: throw new Error('Unknown message: ' + msg?.type);
      }
      await refreshBadge();
      send({ ok: true, data });
    } catch (e) {
      send({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true; // keep the channel open for the async reply
});
