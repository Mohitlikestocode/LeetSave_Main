// background.js - open welcome page on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    } catch (e) {
      console.error('Failed to open welcome page on install', e);
    }
  }
});

// Schedule daily alarm for snapshots at midnight UTC (best-effort)
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.alarms.create('dailySnapshot', { periodInMinutes: 24 * 60 });
  } catch (e) { console.error('alarm create failed', e); }
});

// Helper: best-effort fetch solved count for a leetcode profile URL
async function fetchSolvedCount(profileUrl) {
  try {
    // Try GraphQL by converting profile URL to username (if /u/<username>)
    const parts = new URL(profileUrl).pathname.split('/').filter(Boolean);
    let username = parts[1] || parts[0] || null;
    if (username) {
      // LeetCode GraphQL query to fetch user profile progress (best-effort)
      const gql = `query userProfile($username: String!) { matchedUser(username: $username) { submitStats { acSubmissionNum { difficulty count submissions } } } }`;
      try {
        const resp = await fetch('https://leetcode.com/graphql/', {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ query: gql, variables: { username } })
        });
        const j = await resp.json();
        // Walk response to find total solved (sum of accepted counts)
        const arr = j && j.data && j.data.matchedUser && j.data.matchedUser.submitStats && j.data.matchedUser.submitStats.acSubmissionNum;
        if (Array.isArray(arr)) {
          const total = arr.reduce((acc, item) => acc + (item.count || 0), 0);
          if (total) return total;
        }
      } catch (e) {
        // fallback to scraping
      }
    }
  } catch (e) { /* ignore */ }

  // Fallback: scrape the profile page for 'Solved' text
  try {
    const r = await fetch(profileUrl, { method: 'GET', credentials: 'omit' });
    const text = await r.text();
    const m = text.match(/Solved[\s\S]{0,80}?([0-9,]+)/i) || text.match(/([0-9,]+)\s*Solved/i);
    if (m) return parseInt((m[1] || m[0]).replace(/,/g,''),10);
  } catch (e) { /* ignore */ }

  return null;
}

async function performSnapshot() {
  try {
    const res = await new Promise(r => chrome.storage.local.get(['leetProfiles','leetSnapshots'], r));
    const profiles = (res.leetProfiles || []).filter(p => p.platform === 'leetcode');
    const snaps = res.leetSnapshots || {};
    const todayKey = new Date().toISOString().slice(0,10);
    // Do nothing if today's snapshot already exists
    if (snaps[todayKey] && Object.keys(snaps[todayKey]).length) return;
    const results = {};
    for (const p of profiles) {
      const count = await fetchSolvedCount(p.url);
      results[p.username] = { solved: count, url: p.url };
    }
    snaps[todayKey] = results;
    await new Promise(r => chrome.storage.local.set({ leetSnapshots: snaps }, r));
  } catch (e) { console.error('performSnapshot error', e); }
}

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm && alarm.name === 'dailySnapshot') {
    await performSnapshot();
  }
});

// Allow immediate snapshot via message from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  if (msg && msg.type === 'performSnapshotNow') {
    performSnapshot().then(() => sendResp({ ok: true })).catch((e) => sendResp({ ok: false, error: String(e) }));
    return true; // will respond asynchronously
  }
});
