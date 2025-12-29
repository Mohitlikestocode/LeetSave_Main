// popup.js - merged profiles UI + difficulty toggle

document.addEventListener("DOMContentLoaded", function() {
  // ---------- Profile UI setup ----------
  window.currentPlatform = "leetcode";
  loadProfiles(window.currentPlatform);

  // Platform switch buttons
  const leetBtn = document.getElementById("platformLeetCode");
  if (leetBtn) {
    leetBtn.addEventListener("click", function() {
      window.currentPlatform = "leetcode";
      leetBtn.classList.add("active");
      loadProfiles(window.currentPlatform);
    });
  }

  // Search box
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function(e) {
      searchProfiles(e.target.value);
    });
  }

  // Clear all (for current platform)
  const clearAllBtn = document.getElementById("clearAll");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", function() {
      chrome.storage.local.get(["leetProfiles"], function(result) {
        let profiles = result.leetProfiles || [];
        const filtered = profiles.filter(p => p.platform !== (window.currentPlatform || "leetcode"));
        chrome.storage.local.set({ leetProfiles: filtered }, function() {
          loadProfiles(window.currentPlatform);
        });
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

  // ---------- Difficulty Hider Toggle setup ----------
  const toggleBtn = document.getElementById("toggleDifficulty");
  // load current setting to set button state
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

  function setToggleButton(isEnabled) {
    if (!toggleBtn) return;
    if (isEnabled) {
      toggleBtn.classList.add("active");
      toggleBtn.textContent = "Disable Difficulty Hider";
    } else {
      toggleBtn.classList.remove("active");
      toggleBtn.textContent = "Enable Difficulty Hider";
    }
  }

  if (toggleBtn) {
    loadToggleSetting((isEnabled) => {
      setToggleButton(isEnabled);
    });

    toggleBtn.addEventListener("click", () => {
      loadToggleSetting((isEnabled) => {
        const newVal = !isEnabled;
        chrome.storage.local.set({ isEnabled: newVal }, () => {
          setToggleButton(newVal);
          // Notify active tab by reloading content via storage change (content script listens to storage.onChanged)
          // Optionally, we can also run a small script to immediately update the current tab:
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) return;
            // Execute a no-op script to trigger content script updates if needed.
            // (Not strictly necessary because content script listens to storage.onChanged.)
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
function loadProfiles(platform) {
  chrome.storage.local.get(["leetProfiles"], function(result) {
    let profiles = result.leetProfiles || [];
    // Always filter by platform
    profiles = profiles.filter(p => p.platform === (platform || "leetcode"));
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
        loadProfiles(window.currentPlatform);
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
      // reload current platform view (globals)
      const current = window.currentPlatform || "leetcode";
      loadProfiles(current);
    });
  });
}

function searchProfiles(query) {
  chrome.storage.local.get(["leetProfiles"], function(result) {
    let profiles = result.leetProfiles || [];
    profiles = profiles.filter(p => p.platform === (window.currentPlatform || "leetcode"));
    const filtered = profiles.filter(p =>
      p.username.toLowerCase().includes(query.toLowerCase())
    );
    renderProfiles(filtered);
  });
}
