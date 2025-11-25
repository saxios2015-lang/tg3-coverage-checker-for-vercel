
📘 FloLive TG3 Coverage Checker  
==================================
Local-Hosted Next.js App with OCID Proxy + FCC Fallback (Render Backend)

Overview
---------
This project provides a coverage checker for evaluating whether a given U.S. ZIP code has:

1. TG3-compatible towers (via OpenCellID, filtered to MCC+MNC combinations supported by TG3)
2. FCC fallback provider information (from the official U.S. FCC Broadband Data Collection tables, processed by your FastAPI backend hosted on Render)

The checker is implemented as a Next.js frontend with:
- A local OCID proxy (`/api/ocid`) to avoid CORS/network issues
- A local CSV/TSV PLMN whitelist loader
- A Render-hosted FCC provider lookup backend
- A debug banner to observe all steps and failures
- Full support for internal sharing using ngrok
- Completely isolated from Vercel (due to OCID egress issues)

Architecture
------------
Browser → Ngrok URL → Your Laptop (Next.js App)
   ├── /api/ocid (OCID proxy)
   ├── PLMN whitelist loader
   └── UI

Render Backend → /api/providers/by-zip

Major Issues Encountered (and Solved)
--------------------------------------
1. OCID calls failed on Vercel due to egress blocks.
2. PLMN whitelist initially loaded 0 rows due to TSV parsing.
3. FCC fallback returned 404 because route was `/api/providers/by-zip` not `/providers/by-zip`.
4. Hidden `.env.local` file due to macOS Finder behavior.
5. BBOX math bug caused malformed OpenCellID requests.
6. Vercel regions ignored → moved everything local.

Project Structure
-----------------
your-app/
  pages/
    index.js
    api/
      ocid.js
  public/
    data/
      IMSI_data_tg3.csv
  .env.local
  package.json

Environment Variables
---------------------
OCID_KEY=your-ocid-key
NEXT_PUBLIC_RENDER_BACKEND=https://cell-coverage-app.onrender.com/api

Running Locally
----------------
npm install
npm run dev
Open http://localhost:3000/?debug=1

Sharing with Ngrok
-------------------
ngrok http 3000
Share the https://xxxxx.ngrok-free.app URL with coworkers.

TG3 Matching Logic
-------------------
- Convert MCCMNC to 6-digit PLMN.
- Load only rows with "EU 2" or "US 2".
- Filter OCID towers against whitelist.

FCC Fallback
------------
Uses FCC Broadband Data merged by ZIP using county crosswalk. Returns:
- provider_id
- provider_name
- counties
- providers_count

Final Summary
--------------
Fully functioning local coverage checker with:
- OCID proxy
- PLMN TSV parsing
- FCC fallback via Render
- Debug banner
- Ngrok sharing
- No reliance on Vercel
