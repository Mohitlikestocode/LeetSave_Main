// content.js - merged LeetSave + Difficulty Hider
(function() {
  // --------------------------
  // Utils
  // --------------------------
  function isLeetCodeUrl(url) {
    return url.includes("leetcode.com");
  }
  // Codeforces support removed — extension is LeetCode-only

  // --------------------------
  // ---------- LeetSave: inject Save button on profile pages (LeetCode & Codeforces)
  // --------------------------
  (function LeetSaveSection() {
    // Helper to remove button if present
    function removeSaveButton() {
      const btn = document.getElementById("leetSaveButton");
      if (btn) btn.remove();
    }

    // Main logic to inject the button
    function injectSaveButton() {
      // Detect platform and profile page
      let platform = null;
      let username = null;
      let showButton = false;
      const url = window.location.href;

      // LeetCode: /u/username/
      if (isLeetCodeUrl(url)) {
        const pathParts = window.location.pathname.split("/").filter(Boolean);
        if (pathParts[0] === "u" && pathParts.length === 2 && /^[a-zA-Z0-9_-]{3,}$/.test(pathParts[1])) {
          platform = "leetcode";
          username = pathParts[1];
          showButton = true;
        }
      }
      // (Codeforces removed) only LeetCode: /u/username/

  if (!showButton || !username) return;
      if (document.getElementById("leetSaveButton")) return;

      const btn = document.createElement("button");
      btn.id = "leetSaveButton";
      btn.style.position = "fixed";
      btn.style.top = "80px";
      btn.style.right = "143px";
      btn.style.zIndex = "99999";
  btn.style.background = "#ffa116";
      btn.style.color = "#000";
      btn.style.border = "none";
      btn.style.padding = "10px 20px";
      btn.style.borderRadius = "6px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "14px";

      // Check if already saved and set initial state
      chrome.storage.local.get(["leetProfiles"], function(result) {
        let profiles = result.leetProfiles || [];
  const isSaved = profiles.some(p => p.username === username && p.platform === 'leetcode');
  setButtonState(btn, isSaved);

        btn.onclick = function() {
          // Minimalistic click animation
          btn.style.transform = "scale(0.95)";
          btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
          setTimeout(() => {
            btn.style.transform = "scale(1)";
            btn.style.boxShadow = "none";
          }, 150);
          chrome.storage.local.get(["leetProfiles"], function(result2) {
            let profiles2 = result2.leetProfiles || [];
            const idx = profiles2.findIndex(p => p.username === username && p.platform === platform);
            if (idx === -1) {
              // Save profile — add daily snapshot container
              const entry = { username, url, platform: 'leetcode', addedAt: Date.now(), snapshots: [] };
              profiles2.push(entry);
              chrome.storage.local.set({ leetProfiles: profiles2 }, function() {
                setButtonState(btn, true);
                showToast(`Profile saved!`, () => {});
              });
            } else {
              // Remove profile
              const removed = profiles2[idx];
              profiles2.splice(idx, 1);
                chrome.storage.local.set({ leetProfiles: profiles2 }, function() {
                  setButtonState(btn, false);
                showToast(`Profile removed!`, () => {
                  // Undo logic: re-add profile
                  chrome.storage.local.get(["leetProfiles"], function(res2) {
                    let arr = res2.leetProfiles || [];
                    arr.push(removed);
                    chrome.storage.local.set({ leetProfiles: arr }, function() {
                      setButtonState(btn, true);
                    });
                  });
                });
              });
            }
          });
        };
      });

      document.body.appendChild(btn);
    }

    // Helper to set button state
    function setButtonState(btn, isSaved) {
      if (isSaved) {
        btn.innerText = `✅ Saved LeetCode Profile`;
        btn.style.background = "#28a745";
        btn.disabled = false;
      } else {
        btn.innerText = `⭐ Save this LeetCode Profile`;
        btn.style.background = "#ffa116";
        btn.disabled = false;
      }
    }

    // Toast notification function
    function showToast(message, undoCallback) {
      // Remove existing toast if present
      const oldToast = document.getElementById("leetsave-toast");
      if (oldToast) oldToast.remove();

      const toast = document.createElement("div");
      toast.id = "leetsave-toast";
      toast.style.position = "fixed";
      toast.style.bottom = "30px";
      toast.style.right = "30px";
      toast.style.background = "#222";
      toast.style.color = "#fff";
      toast.style.padding = "12px 20px";
      toast.style.borderRadius = "8px";
      toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
      toast.style.zIndex = 9999;
      toast.style.display = "flex";
      toast.style.alignItems = "center";
      toast.style.gap = "16px";
      toast.innerText = message;

      if (undoCallback) {
        const cancelBtn = document.createElement("button");
        cancelBtn.innerText = "Cancel";
        cancelBtn.style.marginLeft = "12px";
        cancelBtn.style.background = "#ff4d4f";
        cancelBtn.style.color = "#fff";
        cancelBtn.style.border = "none";
        cancelBtn.style.borderRadius = "4px";
        cancelBtn.style.padding = "4px 10px";
        cancelBtn.style.cursor = "pointer";
        cancelBtn.onclick = () => {
          undoCallback();
          toast.remove();
        };
        toast.appendChild(cancelBtn);
      }

      document.body.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 4000);
    }

    // Observe URL changes (for SPA navigation) and inject on dynamic pages
    let lastPath = window.location.pathname;
    const navObserver = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        removeSaveButton();
        setTimeout(() => { injectSaveButton(); }, 100);
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });

    // Initial injection
    injectSaveButton();
    // Also try injecting after a short delay to catch dynamic pages
    setTimeout(injectSaveButton, 700);
  })();

  // --------------------------
  // ---------- Difficulty Hider (LeetCode only)
  // --------------------------
  (function DifficultyHiderSection() {
    // Load setting from storage
    function loadSettings(callback) {
      chrome.storage.local.get("isEnabled", (data) => {
        const isEnabled = data.isEnabled !== undefined ? data.isEnabled : true;
        callback(isEnabled);
      });
    }

    // Update difficulty visibility
    function updateDifficultyVisibility(isEnabled) {
      const problemSetDifficultyElements = document.querySelectorAll(
        "div[role='cell'] span[class*='text-']"
      );
      const problemPageDifficultyElements = document.querySelectorAll(
        "div[class*='text-difficulty-']"
      );

      if (isEnabled) {
        problemSetDifficultyElements.forEach((element) => {
          element.style.display = "none";
        });
        problemPageDifficultyElements.forEach((element) => {
          element.style.display = "none";
        });
      } else {
        problemSetDifficultyElements.forEach((element) => {
          element.style.display = "";
        });
        problemPageDifficultyElements.forEach((element) => {
          element.style.display = "";
        });
      }
    }

    // Mutation observer handler
    function handleMutations(mutations) {
      loadSettings((isEnabled) => {
        updateDifficultyVisibility(isEnabled);
      });
    }

    // Initialize observer
    function initializeMutationObserver() {
      const observer = new MutationObserver(handleMutations);
      const config = { childList: true, subtree: true };
      observer.observe(document.body, config);
      // Return observer in case we need it later
      return observer;
    }

    // Initialize module
    function initializeDifficultyHider() {
      if (!isLeetCodeUrl(window.location.href)) return; // only LeetCode

      // Initial load
      loadSettings((isEnabled) => {
        updateDifficultyVisibility(isEnabled);
      });

      // Set up MutationObserver
      initializeMutationObserver();

      // Listen for changes to chrome storage and update the page when settings change
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (changes.isEnabled) {
          const isEnabled = changes.isEnabled.newValue;
          updateDifficultyVisibility(isEnabled);
        }
      });
    }

    // Run
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeDifficultyHider);
    } else {
      initializeDifficultyHider();
    }
  })();

  // end IIFE
})();
