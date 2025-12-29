// github_handler.js
// Minimal GitHub helper for verifying a PAT and creating/updating files.
// Security: stores tokens only in chrome.storage.local. No client_secret/OAuth.

// Verify whether PAT can access and push to owner/repo
async function verifyRepoWriteAccess(owner, repo, pat) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  // Try with Bearer scheme (recommended for fine-grained tokens). If that fails, try token scheme.
  let res = await fetch(url, { headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' } });
  if (res.status === 401 || res.status === 403) {
    // try the older token= format
    res = await fetch(url, { headers: { Authorization: `token ${pat}`, Accept: 'application/vnd.github+json' } });
  }
  if (!res.ok) {
    const text = await res.text();
    // include status and body for caller to display
    const e = new Error('Repo access check failed: ' + res.status);
    e.response = { status: res.status, body: text };
    throw e;
  }
  const json = await res.json();
  const canPush = json.permissions ? !!json.permissions.push : undefined;
  return { ok: true, canPush, json };
}

// Create or update a file at path in the repo. content is raw string.
async function createOrUpdateFile(owner, repo, path, content, message, pat) {
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const headers = { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const getRes = await fetch(getUrl, { headers });
  let existingSha = undefined;
  if (getRes.ok) {
    const data = await getRes.json();
    existingSha = data.sha;
  }
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(existingSha ? { sha: existingSha } : {})
  };
  let putRes = await fetch(getUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!putRes.ok) {
    const errText = await putRes.text();
    // Attach the raw response text to the error object for callers to inspect
    putRes._rawText = errText;
    // If forbidden, attempt branch fallback: create new branch and retry
    if (putRes.status === 403) {
      console.warn('Initial write forbidden, attempting branch fallback');
      try {
        // Fetch repo info to find default branch and its commit sha
        const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
        const repoRes = await fetch(repoUrl, { headers });
        if (!repoRes.ok) throw new Error('Failed to read repo info for fallback');
        const repoJson = await repoRes.json();
        const defaultBranch = repoJson.default_branch || 'main';
        // Get ref for default branch
        const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`;
        const refRes = await fetch(refUrl, { headers });
        if (!refRes.ok) {
          // Possibly empty repo (no refs). Try initial commit flow: create blob, tree, commit, ref.
          // Create blob for the file content
          const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, { method: 'POST', headers, body: JSON.stringify({ content: body.content, encoding: 'base64' }) });
          if (!blobRes.ok) {
            const btext = await blobRes.text();
            throw new Error('Failed to create blob for initial commit: ' + btext);
          }
          const blobJson = await blobRes.json();
          // Create tree including the file
          const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, { method: 'POST', headers, body: JSON.stringify({ tree: [ { path, mode: '100644', type: 'blob', sha: blobJson.sha } ] }) });
          if (!treeRes.ok) {
            const ttext = await treeRes.text();
            throw new Error('Failed to create tree for initial commit: ' + ttext);
          }
          const treeJson = await treeRes.json();
          // Create commit with no parents
          const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, { method: 'POST', headers, body: JSON.stringify({ message: message || 'Initial commit by LeetSave', tree: treeJson.sha }) });
          if (!commitRes.ok) {
            const ctext = await commitRes.text();
            throw new Error('Failed to create commit for initial commit: ' + ctext);
          }
          const commitJson = await commitRes.json();
          // Create ref for new branch
          const newBranch = `leetsave/autocommit-${Date.now()}`;
          const createRefRes2 = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, { method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: commitJson.sha }) });
          if (!createRefRes2.ok) {
            const cr2text = await createRefRes2.text();
            throw new Error('Failed to create ref for initial commit: ' + cr2text);
          }
          // Return a minimal success object with html_url to the committed file
          return { content: { html_url: `https://github.com/${owner}/${repo}/blob/${newBranch}/${encodeURIComponent(path)}` }, commit: { sha: commitJson.sha }, branch: newBranch };
        }
        const refJson = await refRes.json();
        const baseSha = refJson.object && refJson.object.sha;
        if (!baseSha) throw new Error('Could not determine base sha for fallback branch');
        const newBranch = `leetsave/autocommit-${Date.now()}`;
        const createRefUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
        const createRefRes = await fetch(createRefUrl, { method: 'POST', headers, body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }) });
        if (!createRefRes.ok) {
          const crText = await createRefRes.text();
          throw new Error('Failed to create fallback branch: ' + crText);
        }
        // Retry PUT with branch param
        const bodyWithBranch = Object.assign({}, body, { branch: newBranch });
        putRes = await fetch(getUrl, { method: 'PUT', headers, body: JSON.stringify(bodyWithBranch) });
        if (!putRes.ok) {
          const finalErr = await putRes.text();
          putRes._rawText = finalErr;
          const msg = `GitHub write failed after branch fallback: ${putRes.status} ${finalErr}`;
          console.error(msg);
          const e = new Error(msg);
          e.response = { status: putRes.status, body: finalErr };
          throw e;
        }
        return putRes.json();
      } catch (fallbackErr) {
        const msg = `GitHub write failed: ${putRes.status} ${errText}; fallback error: ${fallbackErr.message || fallbackErr}`;
        console.error('createOrUpdateFile fallback error', fallbackErr);
        const e = new Error(msg);
        e.response = { status: putRes.status, body: errText };
        e.fallback = { message: fallbackErr.message || fallbackErr };
        throw e;
      }
    }
    const msg = `GitHub write failed: ${putRes.status} ${errText}`;
    console.error('createOrUpdateFile error', { url: getUrl, status: putRes.status, body: errText });
    const e = new Error(msg);
    e.response = { status: putRes.status, body: errText };
    throw e;
  }
  return putRes.json();
}

// Expose functions to other scripts
window.leetSaveGithub = {
  verifyRepoWriteAccess,
  createOrUpdateFile
};

// TODO: Consider replacing client-side PAT usage with a GitHub App and server-side token handling for stronger security.
