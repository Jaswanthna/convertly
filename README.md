# Convertly

Convertly is a file-conversion app with a React frontend and a Node.js/Express backend. Source code and dependencies are kept in separate `frontend/` and `backend/` folders. In production, the backend serves the built frontend and API on the same origin.

## Requirements

- Node.js 22 or newer and npm.
- Optional: [LibreOffice](https://www.libreoffice.org/) for additional office-format conversions.

Python, `requirements.txt`, and Docker are not required.

## Project layout

```text
backend/
  src/
    conversion.js   Conversion adapters and temporary-file cleanup
    formats.js      Format definitions and per-source conversion options
    server.js       Express API, health check, and production frontend hosting
  test/             Conversion and API regression tests
  package.json
  package-lock.json
frontend/
  src/              React interface and styles
    supabase.js      Optional Google sign-in client
    version.json     UI version shown in the footer
  index.html
  vite.config.js    Local /api proxy to the backend
  package.json
  package-lock.json
.github/workflows/version.yml  Patch-version automation for main
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

Run the backend's conversion and API tests from the repository root:

```powershell
npm test --prefix backend
```

The GitHub Actions validation workflow runs these tests and builds the frontend for pull requests and pushes to `main`.

## Conversion support

The API advertises options for the uploaded file and installed conversion engines. Built-in conversions include:

- Common images ↔ PNG, JPG, WebP, AVIF, TIFF, and GIF; images → PDF.
- PDF → first-page PNG/JPG, extracted text, or Markdown with page headings.
- CSV ↔ XLSX; CSV/XLSX → text, Markdown table, or PDF. Spreadsheet exports use the first worksheet.
- DOC/DOCX → extracted text, Markdown, or PDF. These text-based exports do not preserve layout.
- HTML → Markdown, and common source/config formats (JSON, XML, YAML, JavaScript/TypeScript, Python, Java, C/C++, C#, Go, Rust, PHP, Ruby, shell, SQL, CSS, Vue, and Svelte) → fenced Markdown or plain text.
- Plain text/Markdown → PDF or the other text format.

Installing LibreOffice enables additional format-preserving office-document conversions. There is no universal, lossless conversion between every possible pair of file types. Image uploads are limited to 50 MB; files are staged in per-request temporary directories and removed after conversion or request failure.

Markdown output is intended to make extracted or structured content easier for AI tools to read. It does not infer meaning from pixels: images can be converted to other image formats or PDF, but image OCR and scanned-PDF OCR are not included. PDF/DOC text exports cannot preserve the original layout, and unsupported or binary formats are not falsely advertised as Markdown conversions.

### Upload safety and service limits

- Uploads are written to generated temporary filenames, not user-supplied paths. The API checks known file signatures or UTF-8 text validity before conversion, enforces a 50 MB limit, limits decoded images to 40 megapixels and PDF page renders to 16 megapixels, and permits one simultaneous conversion per service process by default (`MAX_CONCURRENT_CONVERSIONS` can be adjusted after resource testing).
- Conversion outputs and upload workspaces are removed when the download finishes, the connection closes, or conversion fails. The service also sets basic browser security headers and request timeouts.
- These protections are not a substitute for malware scanning or sandboxing: LibreOffice and file parsers run on the same host as the API. Avoid sensitive or untrusted public workloads until converters are isolated and a malware-scanning strategy is in place. The in-memory concurrency cap is per process and is not a distributed rate limiter.

For Windows, if LibreOffice is installed but not discoverable as `libreoffice`, set `LIBREOFFICE_PATH` to its executable path before starting the backend.

## Themes, accounts, and contact

- Light and dark themes are available in the header; the selected theme is saved in this browser.
- File conversion remains available without signing in. Optional Google sign-in uses Supabase Auth.
- Account identities and provider-managed email/profile information are stored by Supabase Auth. Convertly does not store passwords or maintain its own account database. There is no separate profile database yet; if app-specific user data is added later, store it in Supabase Postgres with Row Level Security enabled.
- Contact: Jaswanth NA · [jaswanthna@gmail.com](mailto:jaswanthna@gmail.com) · [LinkedIn](https://www.linkedin.com/in/jaswanth-na/).

### Configure Google sign-in

1. Create a Supabase project and enable Google under **Authentication → Providers**.
2. Create a Google OAuth client in Google Cloud. Add the Supabase callback URL shown by the provider settings (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI.
3. In Supabase **Authentication → URL Configuration**, set the site URL to your deployed Render URL (for example `https://convertly-jaswanthna.onrender.com`) and add that URL to the redirect allow list. Add `https://convertly.jaswanthna.com` too if you later enable the custom domain.
4. In Render's service environment, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project URL and public anon/publishable key. These are frontend build-time settings, so trigger a new deploy after adding or changing them. Never put a Supabase `service_role` key in the frontend or commit it to Git.

Until those settings are added and Google is enabled, the sign-in dialog explains that sign-in is not configured; conversion remains usable.

## Deploy to Render

The root `render.yaml` defines one Render web service. It installs the backend and frontend from their separate folders, builds the frontend, then starts the backend to serve both the frontend and API. The build explicitly installs frontend development dependencies because Vite is needed to create the production bundle, even though the service runs with `NODE_ENV=production`. The service uses Render's free plan by default. Free services can sleep when idle and take longer to answer the first request after inactivity. Change the plan in Render if you need continuous availability.

### 1. Review and push the deployment files

Render deploys from GitHub, so the application files must be committed and pushed to the repository's `main` branch first. From the repository root, stage only the intended project files and lockfiles:

```powershell
git add .gitignore README.md render.yaml .github/workflows/version.yml .github/workflows/test.yml `
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

The Blueprint sets `NODE_ENV=production` and the allowed frontend origins. Supabase frontend settings are optional Blueprint environment values; configure them in Render to enable Google sign-in.

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
- Upload limit: 50 MB, one file per conversion; one conversion runs at a time per service process by default. Errors return JSON with an `error` message.
- Set `PORT` to override the local default backend port (`4000`). Render provides `PORT` automatically.
- Set comma-separated `FRONTEND_ORIGIN` values when hosting the frontend on a separate origin. The production Blueprint serves frontend and API together, so normal app requests are same-origin.

The production build commands are the same commands configured in the Blueprint:

```powershell
npm ci --prefix backend
npm ci --include=dev --prefix frontend
npm run build --prefix frontend
npm start --prefix backend
```

## Application version

The UI reads its version from `frontend/src/version.json`, initially `2.0.0`. A GitHub Actions workflow runs for pushes to `main` and increments the patch number once for each non-automation commit in that push (for example, `2.0.0` to `2.0.1`). It creates a separate `[version-bump]` commit; that automation commit is excluded from further increments. The repository must allow GitHub Actions to write contents (`Settings → Actions → General → Workflow permissions → Read and write permissions`) for the update to be pushed.
