"use client";

import Link from "next/link";
import React from "react";

export default function HowItWorks() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 900,
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <header
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>
          How this TG3 coverage checker works
        </h1>
        <Link href="/">
          <button
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back to checker
          </button>
        </Link>
      </header>

      <p style={{ fontSize: 14, color: "#374151", marginBottom: 20 }}>
        This page is meant for engineers at Toast or FloLive who want to
        understand what this tool is doing under the hood – how we determine
        coverage, what data powers it, and where each piece runs.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>1. Purpose</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The app estimates whether a TG3 SIM (managed by FloLive) will have
        usable LTE coverage in a given U.S. ZIP code. Instead of just listing
        carriers, it specifically checks whether there are towers in the area
        that match TG3-supported PLMNs (MCC+MNC combinations) derived from
        FloLive&apos;s IMSI data.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>2. High-level flow</h2>
      <ol style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>User enters a U.S. ZIP code and clicks <strong>Check</strong>.</li>
        <li>
          The frontend geocodes the ZIP via OpenStreetMap&apos;s Nominatim API
          to get a latitude / longitude pair.
        </li>
        <li>
          We build a small bounding box around that location (±0.01° in lat/lon).
        </li>
        <li>
          The frontend calls a Next.js API route <code>/api/ocid</code> which
          runs on Vercel and reads local OCID CSV exports to find all towers
          inside that bounding box.
        </li>
        <li>
          For each tower, we build a PLMN string from MCC+MNC and check whether
          it is in our TG3 whitelist, which is constructed from the FloLive
          IMSI data (only rows tagged <strong>US 2</strong> or{" "}
          <strong>EU 2</strong> are used).
        </li>
        <li>
          If at least one tower matches a TG3 PLMN, we treat the ZIP as having
          TG3 coverage; otherwise we show that TG3 likely does not have
          coverage.
        </li>
        <li>
          In parallel, the app calls a separate backend (hosted on Render) that
          uses FCC Broadband Data Collection (BDC) to list all broadband
          providers in the ZIP and the counties that were checked.
        </li>
      </ol>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>3. Data sources</h2>

      <h3 style={{ fontSize: 16, marginTop: 16 }}>3.1 FloLive IMSI / PLMN data</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        File: <code>public/data/IMSI_data_tg3.csv</code>
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        This file contains a list of PLMNs and their metadata. Columns include:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>PLMN identifier (MCC+MNC)</li>
        <li>Country / region</li>
        <li>Operator name (e.g., AT&amp;T, Verizon)</li>
        <li>IMSI Provider (e.g., <strong>US 2</strong>, <strong>EU 2</strong>)</li>
      </ul>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        During startup, the frontend downloads this CSV and builds:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>
          A <code>Set</code> of PLMNs that are considered TG3-compatible: only
          rows where the IMSI provider contains <strong>US 2</strong> or{" "}
          <strong>EU 2</strong>.
        </li>
        <li>
          A map from PLMN → metadata object with{" "}
          <code>{`{ operatorName, imsiProvider }`}</code>.
        </li>
      </ul>

      <h3 style={{ fontSize: 16, marginTop: 16 }}>3.2 OCID tower data</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        Files: <code>public/data/310.csv</code>, <code>311.csv</code>,{" "}
        <code>312.csv</code>, <code>313.csv</code>, <code>314.csv</code> and so
        on.
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        These are country- or MCC-specific exports from OpenCellID (OCID). Each
        row represents a cell site and includes:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>Radio technology (e.g., LTE, UMTS, GSM)</li>
        <li>MCC and MNC</li>
        <li>LAC and CID</li>
        <li>Latitude and Longitude</li>
      </ul>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        A Next.js API route (<code>pages/api/ocid.js</code>) runs on Vercel and
        loads these CSVs from disk. Given a bounding box, it returns all towers
        whose coordinates fall inside that box.
      </p>

      <h3 style={{ fontSize: 16, marginTop: 16 }}>3.3 FCC Broadband Data</h3>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The app calls a separate backend deployed on Render at:
      </p>
      <pre
        style={{
          background: "#f3f4f6",
          padding: 8,
          borderRadius: 4,
          fontSize: 13,
          overflowX: "auto",
        }}
      >
        /api/providers/by-zip?zip=XXXXX
      </pre>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        That service uses FCC Broadband Data Collection (BDC) exports plus a
        ZIP–county crosswalk to calculate:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>All providers that serve the counties containing the ZIP.</li>
        <li>The set of county names that were included.</li>
      </ul>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The FCC results are informational and serve as a fallback when OCID has
        no TG3-compatible towers in the area.
      </p>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>4. Coverage decision logic</h2>
      <ol style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>
          From the geocoded ZIP, build a bounding box:
          <pre
            style={{
              background: "#f3f4f6",
              padding: 8,
              borderRadius: 4,
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {`minLat = lat - 0.01
maxLat = lat + 0.01
minLon = lon - 0.01
maxLon = lon + 0.01`}
          </pre>
        </li>
        <li>
          Call <code>/api/ocid</code> with this bbox; it returns up to 50 towers.
        </li>
        <li>
          For each tower, construct a PLMN key:
          <pre
            style={{
              background: "#f3f4f6",
              padding: 8,
              borderRadius: 4,
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {`const plmn = \`\${tower.mcc}\${String(tower.mnc).padStart(3, "0")}\`;`}
          </pre>
        </li>
        <li>
          Check if <code>plmn</code> is in the TG3 whitelist Set built from the
          IMSI data.
        </li>
        <li>
          If one or more towers match, the UI reports:
          <br />
          <strong>
            &quot;Yes, TG3 will have coverage from FloLive in your area.&quot;
          </strong>
        </li>
        <li>
          If none match, the UI reports:
          <br />
          <strong>
            &quot;No, TG3 will likely not have coverage from FloLive in your
            area.&quot;
          </strong>
        </li>
      </ol>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>5. What the user sees</h2>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>A coverage verdict (YES/NO with ✅ or ❌).</li>
        <li>
          Counts of total OCID towers vs TG3-compatible towers in the search
          area.
        </li>
        <li>
          A list of the first 10 TG3-compatible towers with radio type,
          MCC/MNC, operator name, IMSI provider, PLMN, and coordinates.
        </li>
        <li>FCC provider list with human-readable names and IDs.</li>
        <li>
          The list of counties (from FCC BDC) that were used to infer providers
          for that ZIP.
        </li>
        <li>
          A debug banner at the top with internal logs that help engineers
          understand what happened for each request.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>6. Deployment architecture</h2>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>
          <strong>Frontend:</strong> Next.js app deployed on Vercel, using the
          pages router.
        </li>
        <li>
          <strong>OCID API:</strong> <code>pages/api/ocid.js</code> runs as a
          Vercel serverless function and reads the OCID CSVs from the
          repository at runtime.
        </li>
        <li>
          <strong>FCC backend:</strong> Separate FastAPI service on Render,
          called via the <code>NEXT_PUBLIC_RENDER_BACKEND</code> environment
          variable.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>7. Limitations</h2>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>OCID CSVs are snapshots and may become stale over time.</li>
        <li>
          Bounding box is fixed size; it doesn&apos;t adapt to rural vs dense
          areas.
        </li>
        <li>
          The tool answers &quot;is there a TG3-compatible tower nearby?&quot;
          but does not estimate signal quality or indoor coverage.
        </li>
      </ul>

      <h2 style={{ fontSize: 20, marginTop: 24 }}>8. Summary</h2>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        In short, this tool joins three worlds:
      </p>
      <ul style={{ fontSize: 14, lineHeight: 1.6, paddingLeft: 20 }}>
        <li>
          <strong>OCID</strong> for a crowdsourced view of where towers are.
        </li>
        <li>
          <strong>FloLive IMSI/PLMN data</strong> to understand where TG3 SIMs
          can actually roam (US 2 / EU 2).
        </li>
        <li>
          <strong>FCC BDC data</strong> to provide a regulatory view of which
          providers serve a given ZIP code.
        </li>
      </ul>
      <p style={{ fontSize: 14, lineHeight: 1.6 }}>
        The end result is a transparent coverage checker that engineering,
        support, and field teams can use to reason about TG3 deployments in the
        U.S., with enough detail to debug edge cases when needed.
      </p>
    </main>
  );
}
