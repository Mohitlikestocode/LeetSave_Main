require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

const app = express();
app.use(bodyParser.json({ limit: '256kb' }));

const APP_ID = process.env.GH_APP_ID;
const PRIVATE_KEY = process.env.GH_PRIVATE_KEY;

if (!APP_ID || !PRIVATE_KEY) {
  console.error('Missing GH_APP_ID or GH_PRIVATE_KEY in environment. See .env.example');
  process.exit(1);
}

// Simple endpoint: POST /commit
// body: { owner, repo, path, content (base64 or raw), message }
app.post('/commit', async (req, res) => {
  try {
    const { owner, repo, path, content, message } = req.body;
    if (!owner || !repo || !path || !content) return res.status(400).json({ error: 'Missing fields' });

    // Authenticate as App installation for the target repo
    const auth = createAppAuth({ id: APP_ID, privateKey: PRIVATE_KEY });
    // Find installation id for owner (user or org)
    const appOctokit = new Octokit({ authStrategy: createAppAuth, auth: { id: APP_ID, privateKey: PRIVATE_KEY } });

    // List installations and find one that matches the owner
    const installs = await appOctokit.request('GET /app/installations');
    const installation = installs.data.find(i => i.account && i.account.login && i.account.login.toLowerCase() === owner.toLowerCase());
    if (!installation) return res.status(403).json({ error: 'App not installed on target owner' });

    // Create installation auth
    const installationAuth = await auth({ type: 'installation', installationId: installation.id });
    const octokit = new Octokit({ auth: installationAuth.token });

    // Check if file exists to get sha
    let sha = null;
    try {
      const getRes = await octokit.repos.getContent({ owner, repo, path });
      if (getRes && getRes.data && getRes.data.sha) sha = getRes.data.sha;
    } catch (e) { /* ignore not found */ }

    const encoded = Buffer.from(content, 'utf8').toString('base64');
    const params = { owner, repo, path, message: message || 'LeetSave commit', content: encoded };
    if (sha) params.sha = sha;
    const putRes = await octokit.repos.createOrUpdateFileContents(params);
    res.json({ ok: true, url: putRes.data.content && putRes.data.content.html_url });
  } catch (err) {
    console.error('Commit error', err);
    res.status(500).json({ error: String(err), details: err && err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('LeetSave commit server listening on', port));
