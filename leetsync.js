// leetsync.js - handles the standalone LeetSync settings page
document.addEventListener('DOMContentLoaded', () => {
  // If chrome.storage is not available, this page may have been opened directly (file://) instead of via the extension.
  if (!window.chrome || !chrome.storage) {
    const warn = document.createElement('div');
    warn.style.background = '#ffe6e6';
    warn.style.color = '#900';
    warn.style.padding = '10px';
    warn.style.borderRadius = '6px';
    warn.style.marginBottom = '10px';
    warn.textContent = 'Warning: chrome.* APIs are not available. Open this page from the extension popup (Configure GitHub Sync) or reload the extension.';
    const card = document.getElementById('leetsync-card');
    if (card) card.parentNode.insertBefore(warn, card);
    // Prevent further chrome.storage calls to avoid uncaught exceptions.
  }
  const revealBtn = document.getElementById('revealForm');
  const form = document.getElementById('leetsync-form');
  const repoInput = document.getElementById('ls-repo');
  const patInput = document.getElementById('ls-pat');
  // server options removed; client-only flow
  const verifyBtn = document.getElementById('ls-verify');
  const testCommitBtn = document.getElementById('ls-testcommit');
  const detailsPre = document.getElementById('ls-details');
  const status = document.getElementById('ls-verify-status');
  const openGithubBtn = document.getElementById('ls-opengithub');
  const patHelpBtn = document.getElementById('ls-pat-help');

  revealBtn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  // Load saved values
  chrome.storage.local.get(['github_repo','github_pat','github_repo_verified'], (data) => {
    if (data.github_repo) repoInput.value = data.github_repo;
    if (data.github_pat) patInput.value = data.github_pat;
    if (data.github_repo_verified) status.textContent = 'Verified';
    // no server settings — client-only PAT flow
  });

  // Reveal form if query param present
  try {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('reveal')) form.style.display = 'block';
  } catch (e) {}

  // PAT reveal button
  const revealPatBtn = document.getElementById('ls-reveal');
  let patVisible = false;
  if (revealPatBtn) {
    revealPatBtn.addEventListener('click', () => {
      patVisible = !patVisible;
      patInput.type = patVisible ? 'text' : 'password';
      revealPatBtn.textContent = patVisible ? 'Hide' : 'Reveal';
    });
  }

  // Auto-commit checkbox: load/save
  const autoCommitCheckbox = document.getElementById('ls-autocommit');
  chrome.storage.local.get(['github_autocommit'], (d) => { if (typeof d.github_autocommit === 'undefined') { autoCommitCheckbox.checked = true; chrome.storage.local.set({ github_autocommit: true }); } else { autoCommitCheckbox.checked = !!d.github_autocommit; } });
  autoCommitCheckbox.addEventListener('change', () => { chrome.storage.local.set({ github_autocommit: !!autoCommitCheckbox.checked }); });

  function parseRepo(input) {
    // Accept full urls like https://github.com/owner/repo or owner/repo
    if (!input) return null;
    input = input.trim();
    try {
      if (input.startsWith('http')) {
        const u = new URL(input);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return parts[0] + '/' + parts[1];
        return null;
      }
      // assume owner/repo
      const parts = input.split('/').map(s => s.trim()).filter(Boolean);
      if (parts.length === 2) return parts[0] + '/' + parts[1];
      return null;
    } catch (e) { return null; }
  }

  verifyBtn.addEventListener('click', async () => {
    status.style.color = '#333';
    const rawRepo = repoInput.value.trim();
    const pat = patInput.value.trim();
    const normalized = parseRepo(rawRepo);
    if (!normalized) { status.style.color = 'red'; status.textContent = 'Enter a valid owner/repo or GitHub repo URL'; return; }
    if (!pat) { status.style.color = 'red'; status.textContent = 'Enter PAT'; return; }
    status.textContent = 'Verifying...';

    const [owner, repo] = normalized.split('/');
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('Repo access check failed: ' + res.status);
      const json = await res.json();
      const canPush = json.permissions ? !!json.permissions.push : undefined;
      if (typeof canPush !== 'undefined') {
        if (!canPush) { status.style.color = 'red'; status.textContent = 'Token does not have push permission for this repo.'; return; }
        // Save
          chrome.storage.local.set({ github_repo: normalized, github_pat: pat, github_repo_verified: true }, () => {
          status.style.color = 'green';
          status.textContent = 'Verified & saved';
        });
      } else {
        // Save but mark unverified
        chrome.storage.local.set({ github_repo: normalized, github_pat: pat, github_repo_verified: false }, () => {
          status.style.color = '#aa6600';
          status.textContent = 'Saved but could not determine push permission. Use a repo-scoped PAT if possible.';
        });
      }
    } catch (err) {
      status.style.color = 'red';
      status.textContent = 'Verify failed: ' + (err.message || err);
    }
  });

  // removed remove button - user can change credentials manually

  // server removed

  if (patHelpBtn) {
    patHelpBtn.addEventListener('click', () => {
      // Open GitHub fine-grained PAT creation page
      window.open('https://github.com/settings/tokens/new?type=code_scanning', '_blank');
      // Show a short checklist in the details box
      if (detailsPre) {
        detailsPre.style.display = 'block';
        detailsPre.textContent = [
          'Recommended PAT checklist:',
          '- Token type: Fine-grained token',
          '- Repository access: Only select repositories → choose your repo',
          '- Permissions: Contents → Read & write',
          '- After creating, copy token and paste into LeetSync',
          '- If repo is in an organization, authorize the token for the org (SSO)'
        ].join('\n');
      }
    });
  }

  // Test commit button - uses saved PAT and repo to create a small file in the repo
  if (testCommitBtn) {
    testCommitBtn.addEventListener('click', async () => {
      status.style.color = '#333';
      status.textContent = 'Running test commit...';
      chrome.storage.local.get(['github_pat','github_repo','github_repo_verified'], async (cfg) => {
        if (!cfg.github_pat || !cfg.github_repo) { status.style.color = 'red'; status.textContent = 'No saved PAT/repo found.'; return; }
        if (!cfg.github_repo_verified) { status.style.color = 'red'; status.textContent = 'Repo not verified for push. Verify first.'; return; }
        const [owner, repo] = cfg.github_repo.split('/');
        // prepare path outside try so fallback can reference it
        const path = `leetcode/leetsave_test_commit_${Date.now()}.txt`;
        try {
          // Prefer server commit when configured
          const serverCfg = await new Promise(r => chrome.storage.local.get(['leetsave_server_url','leetsave_server_enabled'], r));
          if (serverCfg.leetsave_server_enabled && serverCfg.leetsave_server_url) {
            try {
              const body = { owner, repo, path, content: `Test commit created at ${new Date().toISOString()}`, message: 'LeetSave test commit' };
              const sres = await fetch(serverCfg.leetsave_server_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              if (!sres.ok) throw new Error('Server commit failed: ' + sres.status + ' ' + await sres.text());
              const sj = await sres.json();
              status.style.color = 'green';
              status.textContent = 'Test commit succeeded (server): ' + (sj.url || 'Success');
              return;
            } catch (se) {
              console.warn('Server commit failed, falling back to client API', se);
              // fall through to client-side attempt
            }
          }
          const res = await window.leetSaveGithub.createOrUpdateFile(owner, repo, path, `Test commit created at ${new Date().toISOString()}`, 'LeetSave test commit', cfg.github_pat);
          status.style.color = 'green';
          status.textContent = 'Test commit succeeded: ' + (res.content && res.content.html_url ? res.content.html_url : 'Success');
        } catch (err) {
          console.error('Test commit error', err);
          status.style.color = 'red';
          status.textContent = 'Test commit failed: ' + (err.message || err) + ' — attempting browser fallback...';
          // Show raw details if available
          if (detailsPre) {
            try {
              detailsPre.style.display = 'block';
              const detailsObj = { message: err.message };
              if (err.response) detailsObj.response = err.response;
              if (err.fallback) detailsObj.fallback = err.fallback;
              detailsPre.textContent = JSON.stringify(detailsObj, null, 2);
            } catch (e) { detailsPre.textContent = String(err); }
          }
          // Browser fallback: open GitHub "Create new file" page prefilled with filename and content
          try {
            // Try to get default branch from repo metadata
            const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
            const repoRes = await fetch(repoUrl, { headers: { Authorization: `Bearer ${cfg.github_pat}`, Accept: 'application/vnd.github+json' } });
            let branch = 'main';
            if (repoRes.ok) {
              const repoJson = await repoRes.json();
              branch = repoJson.default_branch || branch;
            }
            const fallbackPath = path;
            const fallbackContent = `Test commit created at ${new Date().toISOString()}`;
            // Construct GitHub new file URL with filename and value query params
            const baseNewUrl = `https://github.com/${owner}/${repo}/new/${encodeURIComponent(branch)}`;
            const params = new URLSearchParams({ filename: fallbackPath, value: fallbackContent });
            const newFileUrl = `${baseNewUrl}?${params.toString()}`;
            // Attempt to copy content to clipboard for easier pasting if needed
            try {
              await navigator.clipboard.writeText(fallbackContent);
              status.textContent = 'Test commit failed — opened GitHub new file page and copied content to clipboard.';
            } catch (clipErr) {
              status.textContent = 'Test commit failed — opened GitHub new file page. If content is missing, paste it from your clipboard.';
            }
            window.open(newFileUrl, '_blank');
          } catch (fallbackErr) {
            console.error('Fallback failed', fallbackErr);
            status.textContent = 'Test commit failed and fallback failed: ' + (fallbackErr.message || fallbackErr);
          }
        }
      });
    });
  }

  // removed show details button

  // Open on GitHub (manual) button
  if (openGithubBtn) {
    openGithubBtn.addEventListener('click', () => {
      chrome.storage.local.get(['github_repo','github_pat'], async (cfg) => {
        if (!cfg.github_repo) { status.style.color = 'red'; status.textContent = 'No saved repo configured.'; return; }
        const [owner, repo] = cfg.github_repo.split('/');
        try {
          let branch = 'main';
          if (cfg.github_pat) {
            const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
            const repoRes = await fetch(repoUrl, { headers: { Authorization: `Bearer ${cfg.github_pat}`, Accept: 'application/vnd.github+json' } });
            if (repoRes.ok) {
              const rj = await repoRes.json();
              branch = rj.default_branch || branch;
            }
          }
          const filename = `leetcode/leetsave_manual_${Date.now()}.txt`;
          const value = `Manual commit created at ${new Date().toISOString()}`;
          const url = `https://github.com/${owner}/${repo}/new/${encodeURIComponent(branch)}?${new URLSearchParams({ filename, value }).toString()}`;
          try { await navigator.clipboard.writeText(value); } catch(e){}
          window.open(url, '_blank');
          status.style.color = '#333';
          status.textContent = 'Opened GitHub new-file page; content copied to clipboard.';
        } catch (err) {
          status.style.color = 'red';
          status.textContent = 'Failed to open GitHub page: ' + (err.message || err);
        }
      });
    });
  }
});
