LeetSave GitHub Commit Server

This small Node.js server is an optional companion to the LeetSave Chrome extension. It performs commits to GitHub on behalf of the extension using a GitHub App. This avoids storing a full PAT in the extension and lets you perform fully automated commits securely.

Quick start

1. Create a GitHub App (Settings → Developer settings → GitHub Apps):
   - Give it a name (e.g. LeetSave Commit App)
   - Set the callback URL to your server if you need OAuth flows (not required here)
   - Permissions: Repository permissions → Contents: Read & write
   - Subscribe to any events you want (not required)
   - Install the app on the target repository (or organization)
   - Download the private key and note the App ID and installation ID

2. Create a .env file from .env.example and fill GH_APP_ID and GH_PRIVATE_KEY

3. Install and run

   npm install
   npm start

4. In the extension’s LeetSync settings, use the server URL (e.g. https://myserver.example.com/commit) as the commit backend.

Security notes

- The server holds a GitHub App private key — keep it secret.
- The extension will send commit requests to the server; protect the server behind HTTPS and, if desired, an authentication layer.
- This approach is safer than embedding a full repo-scoped PAT in the browser, because the App's private key does not go to users; the server controls which repos the app can access via installation.
