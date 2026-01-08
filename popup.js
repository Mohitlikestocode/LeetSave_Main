// popup.js - merged profiles UI + difficulty toggle

document.addEventListener("DOMContentLoaded", function() {
  // ---------- Profile UI setup ----------
  loadProfiles();

  // Search box
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function(e) {
      searchProfiles(e.target.value);
    });
  }

  // Clear all saved profiles
  const clearAllBtn = document.getElementById("clearAll");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", function() {
      chrome.storage.local.set({ leetProfiles: [] }, function() {
        loadProfiles();
      });
    });
  }

  // Export JSON
  const exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function() {
      chrome.storage.local.get(["leetProfiles"], function(result) {
        const dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(JSON.stringify(result.leetProfiles || []));
        const dlAnchor = document.createElement("a");
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", "leetProfiles.json");
        dlAnchor.click();
      });
    });
  }

  // Import JSON
  const importBtn = document.getElementById("importBtn");
  if (importBtn) {
    importBtn.addEventListener("change", function(evt) {
      const file = evt.target.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const imported = JSON.parse(e.target.result);
          if (Array.isArray(imported)) {
            chrome.storage.local.set({ leetProfiles: imported }, function() {
              loadProfiles(window.currentPlatform);
            });
          } else {
            alert("Invalid file");
          }
        } catch {
          alert("Error parsing file");
        }
      };
      reader.readAsText(file);
    });
  }

  // ---------- Difficulty Hider Toggle setup (single-line switch) ----------
  const difficultySwitch = document.getElementById("difficultySwitch");
  function loadToggleSetting(cb) {
    chrome.storage.local.get("isEnabled", (data) => {
      const isEnabled = data.isEnabled !== undefined ? data.isEnabled : true;
      cb(isEnabled);
    });
  }

  // ---------- LeetSync (GitHub) settings ----------
  // Add handler to open the LeetSync configuration page from bottom button
  const configureBtn = document.getElementById('configureGithub');
  if (configureBtn) {
    configureBtn.addEventListener('click', () => {
      // Open the settings page and include a query param to reveal the form
      chrome.tabs.create({ url: chrome.runtime.getURL('leetsync.html') + '?reveal=1' });
    });
  }

  // ---------- Embedded Contests View ----------
  const contestsTabBtn = document.getElementById('openContestsTab');
  const mainView = document.getElementById('mainView');
  const contestsView = document.getElementById('contestsView');
  const backBtn = document.getElementById('backToMain');

  if (contestsTabBtn && mainView && contestsView) {
    contestsTabBtn.addEventListener('click', () => {
      mainView.style.display = 'none';
      contestsView.style.display = 'block';
      // default select 'All'
      document.querySelectorAll('.filters .platform-switch').forEach(b => b.classList.remove('active'));
      const def = document.querySelector('.filters .platform-switch[data-filter="All"]');
      if (def) def.classList.add('active');
      fetchAndRenderContests();
    });
  }

  if (backBtn && mainView && contestsView) {
    backBtn.addEventListener('click', () => {
      contestsView.style.display = 'none';
      mainView.style.display = 'block';
    });
  }

  // Header shows title only as per requested UI; refresh removed

  // Wire filters inside contests view
  document.querySelectorAll('.filters .platform-switch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filters .platform-switch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'All';
      renderContestList();
    });
  });

  function setDifficultySwitchUI(isEnabled) {
    if (!difficultySwitch) return;
    difficultySwitch.classList.toggle('on', isEnabled);
    const textEl = difficultySwitch.querySelector('.switch-text');
    if (textEl) textEl.textContent = isEnabled ? 'ON' : 'OFF';
  }

  if (difficultySwitch) {
    loadToggleSetting(setDifficultySwitchUI);
    difficultySwitch.addEventListener("click", () => {
      loadToggleSetting((isEnabled) => {
        const newVal = !isEnabled;
        chrome.storage.local.set({ isEnabled: newVal }, () => {
          setDifficultySwitchUI(newVal);
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return;
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => { /* noop */ }
            }).catch(() => {});
          });
        });
      });
    });
  }
});

// ---------------------- Profiles functions ----------------------
function loadProfiles() {
  chrome.storage.local.get(["leetProfiles"], function(result) {
    let profiles = result.leetProfiles || [];
    renderProfiles(profiles);
  });
}

function renderProfiles(profiles) {
  const list = document.getElementById("profileList");
  list.innerHTML = "";

  profiles.forEach((profile, index) => {
    const li = document.createElement("li");
    li.className = "profile-item";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = profile.username;

    // column: questions solved today
    const todaySpan = document.createElement('span');
    todaySpan.className = 'solved-today';
    todaySpan.style.marginLeft = '12px';
    todaySpan.style.fontWeight = '600';
    // default display
    let displayVal = '-';
    if (profile.snapshots && profile.snapshots.length >= 2) {
      const last = profile.snapshots[profile.snapshots.length - 1];
      const prev = profile.snapshots[profile.snapshots.length - 2];
      if (last && prev && typeof last.totalSolved === 'number' && typeof prev.totalSolved === 'number') {
        displayVal = String(Math.max(0, last.totalSolved - prev.totalSolved));
      }
    }
    todaySpan.textContent = displayVal;

  // per-row info removed — global info at top covers this

  // per-row refresh removed; use global refresh button at top

    const openBtn = document.createElement("button");
    openBtn.textContent = "Open";
    openBtn.className = "btn-open";
    openBtn.onclick = () => {
      chrome.tabs.create({ url: profile.url });
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "btn-delete";
    deleteBtn.onclick = () => {
      deleteProfile(index);
    };

  nameSpan.className = 'profile-name';
  li.appendChild(nameSpan);
  li.appendChild(todaySpan);
    li.appendChild(openBtn);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

// Wire global refresh button (refresh all saved profiles)
document.addEventListener('DOMContentLoaded', function() {
  const globalRefresh = document.getElementById('globalRefresh');
  if (globalRefresh) {
    globalRefresh.addEventListener('click', async () => {
      globalRefresh.classList.add('spinning');
      chrome.storage.local.get(['leetProfiles'], (res) => {
        const profiles = (res.leetProfiles || []).filter(p => p.platform === 'leetcode');
        const promises = profiles.map((p) => refreshProfileSolvedCount(p.username));
        Promise.allSettled(promises).then(() => {
          loadProfiles(window.currentPlatform);
          globalRefresh.classList.remove('spinning');
        }).catch(() => {
          globalRefresh.classList.remove('spinning');
        });
      });
    });
  }
});

// Fetch current solved count for a username and update storage snapshots
function refreshProfileSolvedCount(username, index) {
  // LeetCode public GraphQL: fetch profile user submit stats
  const gql = `query userProfile($username: String!) {
    matchedUser(username: $username) {
      submitStats: submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
          submissions
        }
      }
    }
  }`;

  return fetch('https://leetcode.com/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { username } })
  }).then(r => r.json()).then(j => {
    let totalSolved = 0;
    try {
      const arr = j.data && j.data.matchedUser && j.data.matchedUser.submitStats && j.data.matchedUser.submitStats.acSubmissionNum;
      if (Array.isArray(arr)) {
        // sum counts of accepted across difficulties
        totalSolved = arr.reduce((s, it) => s + (it.count || 0), 0);
      }
    } catch (e) { totalSolved = 0; }

    // store snapshot with date (UTC date string) to avoid duplicates for same day
    chrome.storage.local.get(['leetProfiles'], (res) => {
      let profiles = res.leetProfiles || [];
      // find index by username
      const idx = profiles.findIndex(p => p.username === username);
      if (idx === -1) return;
      const profile = profiles[idx];
      const todayKey = new Date().toISOString().slice(0,10); // YYYY-MM-DD
      profile.snapshots = profile.snapshots || [];
      const last = profile.snapshots[profile.snapshots.length -1];
      if (!last || last.date !== todayKey) {
        profile.snapshots.push({ date: todayKey, totalSolved });
      } else {
        // update today's snapshot
        last.totalSolved = totalSolved;
      }
      profiles[idx] = profile;
      chrome.storage.local.set({ leetProfiles: profiles }, () => {
        loadProfiles();
      });
    });
  }).catch(err => {
    console.error('Failed to refresh profile', err);
    alert('Failed to refresh data for ' + username);
    throw err;
  });
}

function deleteProfile(index) {
  chrome.storage.local.get(["leetProfiles"], function(result) {
    const profiles = result.leetProfiles || [];
    profiles.splice(index, 1);
    chrome.storage.local.set({ leetProfiles: profiles }, () => {
      loadProfiles();
    });
  });
}

function searchProfiles(query) {
  chrome.storage.local.get(["leetProfiles"], function(result) {
    let profiles = result.leetProfiles || [];
    const filtered = profiles.filter(p =>
      p.username.toLowerCase().includes(query.toLowerCase())
    );
    renderProfiles(filtered);
  });
}

// ---------------------- Contests logic (embedded) ----------------------
const API_BASE = 'https://cp-list.vercel.app/api';
const ENDPOINT = API_BASE + '/contests/upcoming';
let contests = [];
let currentFilter = 'All';

async function fetchAndRenderContests() {
  setContestStatus('Refreshing contests...');
  try {
    const resp = await fetch(ENDPOINT);
    const data = await resp.json();
    contests = (data && data.upcoming_contests) || [];
    setContestStatus('');
    renderContestList();
  } catch (e) {
    console.error('Failed to fetch contests', e);
    setContestStatus('Unable to refresh contests. Please check your internet connection.');
    renderContestList();
  }
}

function setContestStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text || '';
}

function renderContestList() {
  const container = document.getElementById('contestList');
  if (!container) return;
  container.innerHTML = '';

  const filtered = filterContests(contests, currentFilter);
  if (!filtered.length) {
    const p = document.createElement('p');
    p.style.color = '#bbb';
    p.textContent = 'No contests found for this filter.';
    container.appendChild(p);
    return;
  }

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'contest-card';

    const status = computeStatus(c);

    const title = document.createElement('div');
    title.className = 'contest-title';
    const titleLink = document.createElement('a');
    titleLink.href = c.url; titleLink.target = '_blank';
    titleLink.textContent = `${c.site} - ${c.title}`;
    title.appendChild(titleLink);

    const row = document.createElement('div');
    row.className = 'contest-footer';

    const when = document.createElement('div');
    when.className = 'contest-meta';
    const sd = new Date(c.startTime);
    const ed = new Date(c.endTime);
    when.textContent = `Starts: ${fmtDate(sd)} • Ends: ${fmtDate(ed)} • Dur: ${c.duration}m`;

    const chip = document.createElement('span');
    chip.className = 'start-badge';
    chip.textContent = status === 'Upcoming' ? remainingTextCompact(c.startTime) : (status === 'Ongoing' ? 'Ongoing' : 'Ended');

    const platform = document.createElement('div');
    platform.className = 'platform-row';
    const icon = document.createElement('span');
    icon.className = 'platform-icon';
    icon.textContent = platformEmoji(c.site);
    const name = document.createElement('span');
    name.textContent = c.site;

    platform.appendChild(icon);
    platform.appendChild(name);

    row.appendChild(when);
    row.appendChild(chip);

    card.appendChild(title);
    card.appendChild(row);
    card.appendChild(platform);

    container.appendChild(card);
  });
}

function filterContests(list, filterKey) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (filterKey === 'Ongoing') {
    return list.filter(c => c.startTime <= now && c.endTime >= now);
  } else if (filterKey === 'In24') {
    return list.filter(c => c.startTime > now && c.startTime <= now + day);
  } else if (filterKey === 'In7') {
    return list.filter(c => c.startTime > now && c.startTime <= now + 7 * day);
  }
  return list;
}

function computeStatus(c) {
  const now = Date.now();
  if (now > c.endTime) return 'Ended';
  if (now >= c.startTime && now <= c.endTime) return 'Ongoing';
  return 'Upcoming';
}

function remainingText(startMs) {
  const diff = Math.max(0, startMs - Date.now());
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / (60 * 60 * 24));
  const hours = Math.floor((sec / (60 * 60)) % 24);
  const mins = Math.floor((sec / 60) % 60);
  if (days >= 1) return `Starts in ${days}d ${hours}h`;
  if (hours >= 1) return `Starts in ${hours}h ${mins}m`;
  return `Starts in ${mins}m`;
}

function remainingTextCompact(startMs) {
  const diff = Math.max(0, startMs - Date.now());
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / (60 * 60 * 24));
  const hours = Math.floor((sec / (60 * 60)) % 24);
  const mins = Math.floor((sec / 60) % 60);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function platformEmoji(site) {
  switch (site) {
    case 'Codechef': return '🥞';
    case 'Codeforces': return '⚙️';
    case 'Leetcode': return '🧩';
    case 'AtCoder': return '🅰️';
    case 'GeeksForGeeks': return '🟢';
    case 'CodingNinjas': return '{}';
    default: return '🏁';
  }
}

function fmtDate(d) {
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return new Date(d).toISOString();
  }
}
