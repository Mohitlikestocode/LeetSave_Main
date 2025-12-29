// static/scripts/leetcode.js
// Runs on LeetCode problem pages. Detects accepted submissions and shows an overlay to commit the code to GitHub.

(function() {
  // Simple helper to wait
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Intercept fetch to detect submission responses
  const origFetch = window.fetch;
  window.fetch = async function(input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = (typeof input === 'string') ? input : (input && input.url);
      if (url && /submissions|submission|check/i.test(url)) {
        // small delay to let page update
        setTimeout(() => { handlePossibleSubmissionResponse(url, res.clone()); }, 400);
      }
    } catch (e) { console.error('fetch hook error', e); }
    return res;
  };

  async function handlePossibleSubmissionResponse(url, res) {
    try {
      // Try to parse JSON to find status
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        // Heuristic: look for 'status_display' or 'status_msg' fields
        const status = json && (json.status_display || json.status_msg || (json.submission_result && json.submission_result.status_display));
        if (status && /Accepted|accepted/i.test(status)) {
          checkForAcceptedAndShow();
          return;
        }
      }
      // fallback: call checkForAccepted
      setTimeout(() => { checkForAcceptedAndShow(); }, 400);
    } catch (e) { console.error('handlePossibleSubmissionResponse', e); }
  }

  // Fallback: observe DOM changes for submission result elements
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.addedNodes && m.addedNodes.length) {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.textContent && /Accepted|accepted/i.test(node.textContent)) {
            checkForAcceptedAndShow();
          }
        });
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  async function checkForAcceptedAndShow() {
    try {
      // Try to find status elements on page
      const statusEl = document.querySelector('.result__text') || document.querySelector('.submission-result') || null;
      const isAccepted = statusEl ? /Accepted|accepted/i.test(statusEl.textContent) : false;
      if (!isAccepted) return;

      // Determine problem slug from URL
      const slugMatch = window.location.pathname.split('/').filter(Boolean)[1];
      if (!slugMatch) return;

      // Try to read the code from editor or page if possible
      let code = getEditorCode();
              // Show debug/status box so user can see what's happening
              let dbg = document.getElementById('leetsave-debug-box');
              if (!dbg) {
                dbg = document.createElement('div');
                dbg.id = 'leetsave-debug-box';
                Object.assign(dbg.style, { position: 'fixed', right: '20px', bottom: '200px', width: '360px', background: '#222', color: '#fff', padding: '10px', borderRadius: '8px', zIndex: 2147483647, fontFamily: 'Arial, sans-serif', fontSize: '12px', boxShadow: '0 6px 18px rgba(0,0,0,0.2)' });
                document.body.appendChild(dbg);
              }
              const setDbg = (html) => { if (dbg) { dbg.innerHTML = html; } };
              setDbg(`<div><strong>LeetSave</strong> — preparing auto-commit...</div><div style="margin-top:6px;">Path: <code id="ls-dbg-path" style="color:#ffa">...</code></div><div id="ls-dbg-meta" style="margin-top:6px;color:#ccc">meta: loading...</div><div id="ls-dbg-status" style="margin-top:8px;color:#ffa">status: pending</div>`);
      if (!code) {
        // nothing to commit — show overlay so user can manually paste or switch to Code tab
        showCommitOverlay({ slug: slugMatch, code: '' });
        if (dbg) { document.getElementById('ls-dbg-status').textContent = 'status: no code found — opened manual overlay'; }
        return;
      }

  // Determine language / extension. Try to read language select on page
      let lang = '';
      try {
        const sel = document.querySelector('select') || document.querySelector('button[data-cy="lang-select"]');
        if (sel && sel.value) lang = sel.value;
        if (!lang && sel && sel.textContent) lang = sel.textContent.trim();
      } catch (e) {}

      const ext = mapLanguageToExtension(lang) || 'txt';

      // Fetch problem metadata (questionId and title) to build nicer filenames
      let problemMeta = null;
      try {
        problemMeta = await fetchProblemMeta(slugMatch);
      } catch (e) { /* ignore, we'll fallback to slug */ }

      // Show overlay with commit preview
      // Check whether auto-commit is enabled
      chrome.storage.local.get(['github_autocommit','github_pat','github_repo','github_repo_verified'], async (cfg) => {
        const auto = !!cfg.github_autocommit;
          if (auto && cfg.github_repo) {
          // perform automatic commit, prefer server if enabled
          const path = defaultPath(slugMatch, ext, problemMeta);
          const message = `Add solution for ${problemMeta && problemMeta.title ? problemMeta.title : slugMatch}`;
          try {
            const [owner, repoName] = cfg.github_repo.split('/');
            if (cfg.github_pat && cfg.github_repo_verified) {
              await window.leetSaveGithub.createOrUpdateFile(owner, repoName, path, code, message, cfg.github_pat);
            } else {
              throw new Error('No PAT or not verified');
            }
            if (committed) {
              // show temporary badge
              const b = document.createElement('div');
              b.textContent = 'Auto-committed ✓';
              Object.assign(b.style, { position: 'fixed', right: '20px', bottom: '120px', background: '#28a745', color:'#fff', padding:'6px 8px', borderRadius:'6px', zIndex:2147483647 });
              document.body.appendChild(b);
              setTimeout(() => b.remove(), 8000);
              if (dbg) { document.getElementById('ls-dbg-status').textContent = 'status: committed ✓'; setTimeout(() => dbg.remove(), 8000); }
            } else {
              showCommitOverlay({ slug: slugMatch, code, ext });
              if (dbg) { document.getElementById('ls-dbg-status').textContent = 'status: failed — opened manual overlay'; }
            }
          } catch (err) {
            console.error('Auto-commit failed', err);
            // fallback to showing overlay so user can attempt manual commit
            showCommitOverlay({ slug: slugMatch, code, ext });
            if (dbg) { document.getElementById('ls-dbg-status').textContent = 'status: error — ' + (err && err.message ? err.message : String(err)); }
          }
        } else {
          showCommitOverlay({ slug: slugMatch, code, ext });
        }
      });
    } catch (e) {
      console.error('leetcode commit overlay error', e);
    }
  }

  // Manual commit button removed per user request. No injection performed here.

  // Manual injection hooks removed — no manual button will be added.

  function showToast(msg, ms = 3000) {
    let t = document.getElementById('leetsave-toast');
    if (!t) { t = document.createElement('div'); t.id = 'leetsave-toast'; Object.assign(t.style, { position: 'fixed', right: '18px', bottom: '80px', background: '#111', color: '#fff', padding: '8px 12px', borderRadius: '6px', zIndex: 2147483647, boxShadow: '0 6px 18px rgba(0,0,0,0.2)' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => { if (t) t.style.opacity = '0'; }, ms);
  }

  async function fetchProblemMeta(slug) {
    // LeetCode public GraphQL endpoint
    const gql = `query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
      }
    }`;
    const res = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { titleSlug: slug } })
    });
    if (!res.ok) throw new Error('Failed to fetch problem metadata');
    const j = await res.json();
    if (j && j.data && j.data.question) return j.data.question;
    return null;
  }

  function mapLanguageToExtension(lang) {
    if (!lang) return null;
    lang = lang.toLowerCase();
    if (lang.includes('python')) return 'py';
    if (lang.includes('cpp') || lang.includes('c++')) return 'cpp';
    if (lang.includes('java')) return 'java';
    if (lang.includes('javascript') || lang.includes('node') || lang.includes('js')) return 'js';
    if (lang.includes('c#') || lang.includes('csharp')) return 'cs';
    if (lang.includes('ruby')) return 'rb';
    if (lang.includes('go')) return 'go';
    if (lang.includes('php')) return 'php';
    return null;
  }

  // Robust editor content extraction across Monaco, CodeMirror, textarea, and
  // common LeetCode DOM renderings. Returns empty string when nothing found.
  function getEditorCode() {
    try {
      // Monaco editor exposed
      if (window.editor && typeof window.editor.getValue === 'function') {
        const v = window.editor.getValue();
        if (v && v.trim()) return v;
      }
      // LeetCode sometimes uses global variable 'submissionCode' or similar
      if (window.submissionCode && typeof window.submissionCode === 'string' && window.submissionCode.trim()) return window.submissionCode;
      // CodeMirror textarea
      const cmTextArea = document.querySelector('.CodeMirror textarea');
      if (cmTextArea) {
        const v = cmTextArea.value || cmTextArea.textContent || '';
        if (v && v.trim()) return v;
      }
      // plain textarea
      const ta = document.querySelector('textarea');
      if (ta) {
        const v = ta.value || ta.textContent || '';
        if (v && v.trim()) return v;
      }
      // contenteditable pre/code blocks inside submission view
      const codeEl = document.querySelector('pre') || document.querySelector('code[role="textbox"]') || document.querySelector('[data-cy="submission-code"]');
      if (codeEl) {
        const v = codeEl.textContent || '';
        if (v && v.trim()) return v;
      }
    } catch (e) {
      console.error('getEditorCode error', e);
    }
    return '';
  }

  function showCommitOverlay({ slug, code }) {
    // Avoid duplicate overlays
    if (document.getElementById('leetsave-commit-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'leetsave-commit-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', right: '20px', bottom: '20px', width: '420px', maxHeight: '70vh', overflow: 'auto', zIndex: 2147483647,
      background: '#fff', border: '1px solid #ddd', boxShadow: '0 6px 18px rgba(0,0,0,0.12)', borderRadius: '8px', padding: '12px', fontFamily: 'Arial, sans-serif'
    });

    overlay.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <strong>Commit solution to GitHub</strong>
        <button id="ls-close">✕</button>
      </div>
      <div style="margin-top:8px; font-size:12px; color:#444;">File path (editable): <input id="ls-path" style="width:100%" value="${defaultPath(slug, ext)}"></div>
      <div style="margin-top:8px; font-size:12px; color:#444;">Commit message: <input id="ls-message" style="width:100%" value="Add solution for ${slug}"></div>
      <div style="margin-top:8px;"><textarea id="ls-code" style="width:100%; height:200px; font-family:monospace; font-size:12px;">${escapeHtml(code)}</textarea></div>
      <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
        <button id="ls-cancel">Cancel</button>
        <button id="ls-commit" style="background:#28a745; color:#fff; border:none; padding:6px 10px; border-radius:4px;">Commit to GitHub</button>
      </div>
      <div id="ls-status" style="margin-top:8px; font-size:13px; color:#333;"></div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ls-close').addEventListener('click', () => { overlay.remove(); });
    document.getElementById('ls-cancel').addEventListener('click', () => { overlay.remove(); });

    document.getElementById('ls-commit').addEventListener('click', async () => {
      const statusEl = document.getElementById('ls-status');
      statusEl.textContent = 'Preparing to commit...';
      // Read stored PAT and repo
      chrome.storage.local.get(['github_pat','github_repo','github_repo_verified'], async (data) => {
        const pat = data.github_pat;
        const repo = data.github_repo;
        const verified = data.github_repo_verified;
        if (!pat || !repo) {
          statusEl.style.color = 'red';
          statusEl.textContent = 'No GitHub credentials saved. Open extension popup and add a repo + PAT in settings.';
          return;
        }
        if (!verified) {
          statusEl.style.color = 'red';
          statusEl.textContent = 'Repository not verified for write access. Please verify in settings before committing.';
          return;
        }
        const path = document.getElementById('ls-path').value;
        const message = document.getElementById('ls-message').value;
        const fileContent = document.getElementById('ls-code').value;

        statusEl.style.color = '#333';
        statusEl.textContent = 'Committing... please wait';
        try {
          const [owner, repoName] = repo.split('/');
          // Use helper exposed by github_handler.js
          const res = await window.leetSaveGithub.createOrUpdateFile(owner, repoName, path, fileContent, message, pat);
          statusEl.style.color = 'green';
          statusEl.textContent = 'Committed successfully. ' + (res.content && res.content.html_url ? res.content.html_url : '');
          // small badge
          const b = document.createElement('div');
          b.textContent = 'Committed ✓';
          Object.assign(b.style, { position: 'fixed', right: '20px', bottom: '120px', background: '#28a745', color:'#fff', padding:'6px 8px', borderRadius:'6px', zIndex:2147483647 });
          document.body.appendChild(b);
          setTimeout(() => b.remove(), 8000);
        } catch (err) {
          console.error(err);
          statusEl.style.color = 'red';
          statusEl.textContent = 'Commit failed: ' + (err.message || err);
        }
      });
    });
  }

  function defaultPath(slug, ext, meta) {
    // Weekly folder format: Week_{YYYY-MM-DD_to_YYYY-MM-DD}/
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const y = weekStart.getFullYear();
    // Use full year (YYYY) in folder and filename
    const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getFullYear())}`;
    const folder = `${fmt(weekStart)}_to_${fmt(weekEnd)}`;
    // filename: DD-MM-YYYY__<questionId>. <Title>.<ext>
    const datePart = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getFullYear())}`;
    const qid = meta && meta.questionId ? meta.questionId : slug;
    const title = meta && meta.title ? meta.title : slug;
    // sanitize: keep alphanumerics, spaces, dots and dashes; collapse spaces; truncate to 60 chars
    let titleSafe = title.replace(/[^a-z0-9\s\.\-]/ig, '').replace(/\s+/g, ' ').trim();
    if (titleSafe.length > 60) titleSafe = titleSafe.slice(0, 60).trim();
    const fileName = `${datePart}__${qid}. ${titleSafe}.${ext}`;
    return `leetcode/${folder}/${fileName}`;
  }

  function getWeekStart(d) {
    // Week starting Monday
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Monday=0
    date.setDate(date.getDate() - day);
    date.setHours(0,0,0,0);
    return date;
  }

  function escapeHtml(unsafe) {
    return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
