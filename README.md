# Convertly

Convertly is a file-conversion app with a React frontend and a Node.js/Express backend. Source code and dependencies are kept in separate `frontend/` and `backend/` folders. In production, the backend serves the built frontend and API on the same origin.

## Requirements

- Node.js 20 or newer and npm.
- Optional: [LibreOffice](https://www.libreoffice.org/) for additional office-format conversions.

Python, `requirements.txt`, and Docker are not required.

## Project layout

```text
backend/
  src/
    conversion.js   Conversion adapters and temporary-file cleanup
    formats.js      Format definitions and per-source conversion options
    server.js       Express API, health check, and production frontend hosting
  package.json
  package-lock.json
frontend/
  src/              React interface and styles
  index.html
  vite.config.js    Local /api proxy to the backend
  package.json
  package-lock.json
render.yaml         Render Blueprint for production deployment
```

Keep both `package-lock.json` files in Git: they make local and Render installs reproducible. Do not commit `node_modules/`, build output such as `frontend/dist/`, `.env` files, credentials, or temporary uploads; `.gitignore` excludes these.

## Run locally

Open two terminals from the repository root.

Terminal 1 — backend:

```powershell
cd backend
npm ci
npm run dev
```

Terminal 2 — frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the backend at <http://localhost:4000>. Check the backend with <http://localhost:4000/api/health>.

## Conversion support

The API advertises options for the uploaded file and installed conversion engines. Built-in conversions include:

- Common images ↔ PNG, JPG, WebP, AVIF, TIFF, and GIF; images → PDF.
- PDF → first-page PNG/JPG, or extracted text.
- CSV ↔ XLSX; CSV/XLSX → text, Markdown table, or PDF. Spreadsheet exports use the first worksheet.
- DOC/DOCX → extracted text, Markdown, or PDF. These text-based exports do not preserve layout.
- Plain text/Markdown → PDF or the other text format.

Installing LibreOffice enables additional format-preserving office-document conversions. There is no universal, lossless conversion between every possible pair of file types. Image uploads are limited to 50 MB; files are processed in temporary workspaces and removed after conversion.

For Windows, if LibreOffice is installed but not discoverable as `libreoffice`, set `LIBREOFFICE_PATH` to its executable path before starting the backend.

## Deploy to Render

The root `render.yaml` defines one Render web service. It installs the backend and frontend from their separate folders, builds the frontend, then starts the backend to serve both the frontend and API. The build explicitly installs frontend development dependencies because Vite is needed to create the production bundle, even though the service runs with `NODE_ENV=production`. The service uses Render's free plan by default. Free services can sleep when idle and take longer to answer the first request after inactivity. Change the plan in Render if you need continuous availability.

### 1. Review and push the deployment files

Render deploys from GitHub, so the application files must be committed and pushed to the repository's `main` branch first. From the repository root, stage only the intended project files and lockfiles:

```powershell
git add .gitignore README.md render.yaml `
  backend/package.json backend/package-lock.json backend/src `
  frontend/package.json frontend/package-lock.json frontend/index.html `
  frontend/vite.config.js frontend/src
git diff --cached --check
git status --short
```

Review the staged file list. It should contain the application source, package manifests/lockfiles, README, `.gitignore`, and `render.yaml`—not `node_modules`, `dist`, `.env`, or temporary files. Then create and push the initial commit:

```powershell
git commit -m "Prepare Convertly for Render deployment"
git push -u origin main
```

If Git asks for your name or email, configure your Git author identity locally, then repeat the commit. Sign in to GitHub through your normal Git credential flow if the push requests authentication; never put access tokens or passwords in source files or share them in chat.

### 2. Create the Render service

1. Sign in to the [Render Dashboard](https://dashboard.render.com/).
2. Select **New → Blueprint** and connect the GitHub repository `Jaswanthna/convertly`.
3. Select the `main` branch and deploy the Blueprint from the repository's `render.yaml`.
4. Wait for the build and deploy to finish. In the service logs, confirm it starts successfully. Open the Render-provided `onrender.com` URL and check that the site loads and `/api/health` returns `{"status":"ok"}`.

The Blueprint sets `NODE_ENV=production` and the allowed frontend origins. It does not need secrets or credentials.

### 3. Connect `convertly.jaswanthna.com` in Render

1. Open the deployed service's **Settings → Custom Domains**.
2. Add `convertly.jaswanthna.com`.
3. Copy the exact `onrender.com` hostname shown for your service; use that hostname in the GoDaddy CNAME record below.

### 4. Set DNS records in GoDaddy

In the domain's DNS management, add this record:

| Type | Name/Host | Value |
| --- | --- | --- |
| CNAME | `convertly` | The exact service hostname from Render, for example `convertly-jaswanthna.onrender.com` |

Use the actual Render hostname rather than copying the example. Remove any conflicting DNS record for the `convertly` host, but leave the root (`@`) and `www` records and all email-related MX/TXT records unchanged. If GoDaddy shows a TTL choice, its default is fine.

### 5. Verify HTTPS and test the live site

1. Return to Render's **Custom Domains** page and select **Verify**. DNS changes may take time to propagate.
2. Wait for Render to issue the TLS certificate.
3. Open <https://convertly.jaswanthna.com>, upload a small sample file, and test a conversion and download.

Do not share GoDaddy/Render passwords or API tokens; enter credentials only in their respective dashboards. For provider-specific behavior, see [Render's custom domain guide](https://render.com/docs/custom-domains) and [other DNS provider instructions](https://render.com/docs/configure-other-dns).

## Production and API details

- `GET /api/health` — service health check; configured as the Render health-check path.
- `GET /api/formats?source=pdf` — lists supported output formats for a file extension.
- `POST /api/convert` — multipart form fields `file` and `target`; responds with the converted file as a download.
- Upload limit: 50 MB, one file per conversion. Errors return JSON with an `error` message.
- Set `PORT` to override the local default backend port (`4000`). Render provides `PORT` automatically.
- Set comma-separated `FRONTEND_ORIGIN` values when hosting the frontend on a separate origin. The production Blueprint serves frontend and API together, so normal app requests are same-origin.

The production build commands are the same commands configured in the Blueprint:

```powershell
npm ci --prefix backend
npm ci --include=dev --prefix frontend
npm run build --prefix frontend
npm start --prefix backend
```
