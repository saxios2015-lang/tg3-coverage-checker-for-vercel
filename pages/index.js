"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/** --- Debug Banner --- */
function DebugBanner({ items = [] }) {
  if (!items.length) return null;
  const bg = (level) =>
    level === "error" ? "#fee2e2" : level === "warn" ? "#fef3c7" : "#e0f2fe";
  const border = (level) =>
    level === "error" ? "#ef4444" : level === "warn" ? "#f59e0b" : "#0284c7";
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1000 }}>
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            background: bg(it.level),
            borderBottom: `1px solid ${border(it.level)}`,
            padding: "8px 12px",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono','Courier New', monospace",
            fontSize: 13,
          }}
        >
          <b style={{ marginRight: 6 }}>{it.level.toUpperCase()}:</b>
          <span>{it.message}</span>
        </div>
      ))}
    </div>
  );
}

/** --- Loading / Progress Bar --- */
function LoadingBar({ loading }) {
  if (!loading) return null;
  return (
    <div style={{ margin: "10px 0 16px" }}>
      <div
        style={{
          fontSize: 13,
          marginBottom: 4,
          color: "#374151",
        }}
      >
        Checking coverage… this can take a moment if services are waking up.
      </div>
      <div className="loading-bar-container">
        <div className="loading-bar-fill" />
      </div>
      <style jsx>{`
        .loading-bar-container {
          width: 100%;
          max-width: 420px;
          height: 6px;
          border-radius: 9999px;
          background: #e5e7eb;
          overflow: hidden;
          position: relative;
        }
        .loading-bar-fill {
          position: absolute;
          top: 0;
          left: -40%;
          width: 40%;
          height: 100%;
          border-radius: 9999px;
          background: linear-gradient(90deg, #0284c7, #38bdf8);
          animation: loadingBarStripes 1.2s linear infinite;
        }
        @keyframes loadingBarStripes {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(260%);
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- PLMN whitelist helpers ---------- */

function detectDelimiter(text) {
  const commaCount = (text.match(/,/g) || []).length;
  const tabCount = (text.match(/\t/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function normalizePlmn(mccmnc) {
  const raw = (mccmnc || "").trim().replace(/\D/g, "");
  if (raw.length < 5 || raw.length > 6) return null;
  const mcc = raw.slice(0, 3);
  const mnc = raw.slice(3);
  return mcc + mnc.padStart(3, "0");
}

/* ---------- ZIP helpers (local DB) ---------- */

function normalizeZipInput(zipInput) {
  const digitsOnly = (zipInput || "").replace(/\D/g, "");
  if (!digitsOnly) return null;
  if (digitsOnly.length < 5) return null;
  const zip5 = digitsOnly.slice(0, 5);
  return zip5.padStart(5, "0");
}

export default function Home() {
  const [debug, setDebug] = useState([]);
  const [plmns, setPlmns] = useState(new Set()); // whitelist of PLMNs
  const [plmnMeta, setPlmnMeta] = useState({}); // PLMN -> { operatorName, imsiProvider }
  const [zip, setZip] = useState("");
  const [towers, setTowers] = useState([]); // all OCID towers
  const [filtered, setFiltered] = useState([]); // TG3-compatible towers
  const [fccProviders, setFccProviders] = useState([]);
  const [fccCounties, setFccCounties] = useState([]);
  const [fccTitle, setFccTitle] = useState("");
  const [fccError, setFccError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState(null); // detailed geocode error
  const [zipDb, setZipDb] = useState(null); // ZIP -> { lat, lon }

  const log = useCallback((level, msg) => {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      `[${level.toUpperCase()}]`,
      msg
    );
    setDebug((p) => [...p, { level, message: msg }]);
  }, []);

  /* ---------- Load PLMN whitelist from IMSI_data_tg3.csv ---------- */
  const loadPLMNs = useCallback(async () => {
    try {
      log("info", "Starting PLMN whitelist load from /data/IMSI_data_tg3.csv…");
      const res = await fetch("/data/IMSI_data_tg3.csv", { cache: "no-store" });
      if (!res.ok) {
        log(
          "error",
          `Failed to fetch /data/IMSI_data_tg3.csv: ${res.status} ${res.statusText}`
        );
        return;
      }
      const text = await res.text();
      const delim = detectDelimiter(text);
      log("info", `Detected delimiter: ${delim === "\t" ? "TAB" : "COMMA"}`);

      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const set = new Set();
      const meta = {};
      let parsedRows = 0;

      for (const line of lines) {
        const cols = line.split(delim).map((c) => c.trim());
        // IMSI Provider column (e.g. "US 2", "EU 2")
        const providerCell = cols.find((c) => /(US\s*2|EU\s*2)/i.test(c));
        // MCCMNC numeric column (e.g. "27601")
        const mccmncCell = cols.find((c) => /^\d{5,6}$/.test(c));
        if (!providerCell || !mccmncCell) continue;

        const plmn = normalizePlmn(mccmncCell);
        if (!plmn) continue;

        set.add(plmn);

        // From your file: PLMN, MCCMNC, Country, Region, Continent, Operator, IMSI Provider
        // Operator is at index 5 if the row is well-formed.
        let operatorName = "";
        if (cols.length >= 6) {
          operatorName = cols[5];
        }

        if (!meta[plmn]) {
          meta[plmn] = {
            operatorName: operatorName || "Unknown operator",
            imsiProvider: providerCell || "Unknown IMSI provider",
          };
        }

        parsedRows++;
      }

      setPlmns(set);
      setPlmnMeta(meta);
      log(
        "info",
        `Loaded ${set.size} PLMNs from ${parsedRows} rows in IMSI_data_tg3.csv`
      );
      if (!set.size) {
        log(
          "warn",
          "Whitelist ended up empty — check TSV/CSV structure or ‘IMSI Provider’ values."
        );
      }
    } catch (e) {
      log("error", `PLMN parse error: ${e?.message || e}`);
    }
  }, [log]);

  /* ---------- Load ZIP → lat/lon DB from public/data ---------- */
  const loadZipDb = useCallback(async () => {
    try {
      log("info", "Starting ZIP DB load from /data/zip_latlon.json…");
      const res = await fetch("/data/zip_latlon.json", { cache: "force-cache" });
      if (!res.ok) {
        log(
          "error",
          `Failed to fetch /data/zip_latlon.json: ${res.status} ${res.statusText}`
        );
        return;
      }
      const data = await res.json();
      setZipDb(data);
      const count = Object.keys(data).length;
      const sampleKey = Object.keys(data)[0];
      if (sampleKey) {
        log(
          "info",
          `Loaded ZIP DB with ${count} entries. Example ZIP: ${sampleKey}`
        );
      } else {
        log("warn", "ZIP DB loaded but appears to be empty.");
      }
    } catch (e) {
      log("error", `Failed to load ZIP DB: ${e?.message || e}`);
    }
  }, [log]);

  useEffect(() => {
    loadPLMNs();
    loadZipDb();
  }, [loadPLMNs, loadZipDb]);

  /* ---------- Geocoding (Local ZIP → lat/lon DB) ---------- */
  const geocodeZip = async (zipCode) => {
    setGeocodeError(null); // clear previous geocode error

    log("info", `Geocode request for ZIP input: "${zipCode}"`);

    if (!zipDb) {
      const msg =
        "ZIP database is still loading. Please wait a moment and try again.";
      log("warn", msg);
      setGeocodeError(msg);
      return null;
    }

    const normalized = normalizeZipInput(zipCode);
    if (!normalized) {
      const msg = `Invalid ZIP code: "${zipCode}". Please enter a 5-digit US ZIP.`;
      log("warn", msg);
      setGeocodeError(
        msg +
          " We use an internal ZIP-to-coordinate database based on Census ZCTA data."
      );
      return null;
    }

    const entry = zipDb[normalized];
    if (!entry) {
      const msg = `ZIP ${normalized} was not found in the Census ZIP tabulation area dataset.`;
      log("warn", msg);
      setGeocodeError(
        msg +
          " This usually means the ZIP is not a standard ZCTA in the Census data."
      );
      return null;
    }

    const lat = Number(entry.lat);
    const lon = Number(entry.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const msg = `Invalid coordinates for ZIP ${normalized} in local DB.`;
      log("error", msg);
      setGeocodeError(
        msg + " Please verify the ZIP dataset if you continue to see this."
      );
      return null;
    }

    log("info", `Geocode (local) ${normalized} → lat ${lat}, lon ${lon}`);
    return { lat, lon };
  };

  /* ---------- OCID via local proxy (/api/ocid) ---------- */
  const fetchOpenCellId = useCallback(
    async (lat, lon) => {
      try {
        const latN = Number(lat);
        const lonN = Number(lon);
        const minLon = lonN - 0.01;
        const minLat = latN - 0.01;
        const maxLon = lonN + 0.01;
        const maxLat = latN + 0.01;
        const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;

        const url = `/api/ocid?bbox=${encodeURIComponent(
          bbox
        )}&limit=50&format=json`;
        log("info", `Proxy URL: ${url}`);

        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();

        if (!res.ok) {
          log(
            "error",
            `Proxy HTTP ${res.status} ${res.statusText}. Body: ${text.slice(
              0,
              200
            )}…`
          );
          return [];
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          log(
            "error",
            `Proxy returned non-JSON. Body: ${text.slice(0, 200)}…`
          );
          return [];
        }

        const cells = Array.isArray(data?.cells)
          ? data.cells
          : Array.isArray(data)
          ? data
          : [];
        log("info", `Proxy/OCID returned ${cells.length} towers`);
        return cells;
      } catch (e) {
        log("error", `Proxy fetch failed: ${e?.message || e}`);
        return [];
      }
    },
    [log]
  );

  /* ---------- FCC fallback via Render backend ---------- */
  const fetchFccFromRender = useCallback(
    async (zipCode) => {
      setFccProviders([]);
      setFccCounties([]);
      setFccTitle("");
      setFccError(null);

      const backendBase = process.env.NEXT_PUBLIC_RENDER_BACKEND;
      if (!backendBase) {
        log(
          "warn",
          "NEXT_PUBLIC_RENDER_BACKEND is not set — FCC fallback (Render) will be skipped."
        );
        return;
      }

      const url = `${backendBase.replace(
        /\/+$/,
        ""
      )}/providers/by-zip?zip=${encodeURIComponent(zipCode)}`;

      try {
        log("info", `Calling FCC/Render backend: ${url}`);
        const res = await fetch(url);
        const text = await res.text();

        if (!res.ok) {
          log(
            "error",
            `FCC/Render HTTP ${res.status} ${res.statusText}. Body: ${text.slice(
              0,
              200
            )}…`
          );
          setFccError(`FCC backend error: HTTP ${res.status}`);
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          log(
            "error",
            `FCC/Render returned non-JSON. Body: ${text.slice(0, 200)}…`
          );
          setFccError("FCC backend returned non-JSON");
          return;
        }

        const providers = data.providers || data.carriers || [];
        const counties = data.counties || data.county || [];

        setFccProviders(providers);
        setFccCounties(
          Array.isArray(counties) ? counties : [counties].filter(Boolean)
        );
        setFccTitle(
          data.title ||
            "We also checked FCC data to find providers and towers that are in your area. " +
              "Listed below are a list of the providers that are likely in your area. Note: Some providers listed may be the roaming partner for the primary provider in your area. For example, GCI is the main provider in Bethel, Alaska but allows roaming on AT&T - this config would not work with TG3 as the SIM would be rejected when connecting to GCI."
        );

        log(
          "info",
          `FCC/Render providers=${providers.length}, counties=${
            Array.isArray(counties) ? counties.length : 1
          }`
        );
      } catch (e) {
        log("error", `FCC/Render fetch failed: ${e?.message || e}`);
        setFccError(e?.message || "FCC backend error");
      }
    },
    [log]
  );

  /* ---------- Filter towers by PLMN whitelist ---------- */
  const filterCellsByPlmn = useCallback(
    (cells) => {
      const before = cells.length;
      const filtered = cells.filter((t) =>
        plmns.has(`${t.mcc}${String(t.mnc).padStart(3, "0")}`)
      );
      log(
        "info",
        `Filter by PLMN: ${before} → ${filtered.length} after whitelist (${plmns.size} PLMNs).`
      );
      if (plmns.size === 0) {
        log("error", "PLMN whitelist is empty — check parsing/group filter.");
      }
      return filtered;
    },
    [plmns, log]
  );

  /* ---------- Button handler ---------- */
  const handleCheck = async () => {
    setDebug([]); // fresh banner
    setTowers([]);
    setFiltered([]);
    setFccProviders([]);
    setFccCounties([]);
    setFccTitle("");
    setFccError(null);
    setGeocodeError(null);
    setLoading(true);

    log("info", "Starting coverage check…");

    if (!zip.trim()) {
      log("warn", "Enter a ZIP code first.");
      setLoading(false);
      return;
    }

    if (!zipDb) {
      log(
        "warn",
        "ZIP database is not loaded yet. Please wait a moment and try again."
      );
      setGeocodeError(
        "ZIP database is still loading. Please wait a moment and try again."
      );
      setLoading(false);
      return;
    }

    const zipTrimmed = zip.trim();

    try {
      // 1) Always call FCC / Render as fallback
      await fetchFccFromRender(zipTrimmed);

      // 2) Try OCID for green result
      const coords = await geocodeZip(zipTrimmed);
      if (!coords) {
        log(
          "warn",
          "Stopping coverage check because geocoding did not return coordinates."
        );
        return;
      }

      const towersAll = await fetchOpenCellId(coords.lat, coords.lon);
      setTowers(towersAll);

      const filteredTowers = filterCellsByPlmn(towersAll);
      setFiltered(filteredTowers);

      if (filteredTowers.length) {
        log(
          "info",
          `✅ GREEN: Found ${filteredTowers.length} TG3-compatible towers near ${zipTrimmed}.`
        );
      } else {
        log(
          "warn",
          `❌ No TG3-compatible towers found in OCID near ${zipTrimmed}. Using FCC providers as fallback.`
        );
      }
    } finally {
      setLoading(false);
      log("info", "Coverage check complete.");
    }
  };

  const hasCoverage = filtered.length > 0;

  return (
    <main style={{ padding: 20, fontFamily: "sans-serif" }}>
      <DebugBanner items={debug} />
      <LoadingBar loading={loading} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 28, margin: "12px 0 16px" }}>
          TG3 LTE cellular coverage checker (Coverage via FloLive)
        </h1>
        <Link href="/how-it-works">
          <button
            style={{
              background: "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            How this works
          </button>
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="Enter ZIP (e.g. 02135)"
          style={{
            border: "1px solid #ccc",
            padding: 8,
            borderRadius: 6,
            minWidth: 140,
          }}
        />
        <button
          onClick={handleCheck}
          style={{
            background: "#0284c7",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            cursor: "pointer",
            opacity: loading ? 0.8 : 1,
          }}
          disabled={loading}
        >
          {loading ? "Checking…" : "Check"}
        </button>
      </div>

      {/* Summary section */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Summary</h2>
        <ul style={{ fontSize: 14, paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            Does TG3 have coverage in your ZIP?{" "}
            <strong>
              {!zip
                ? "Run a check above to find out."
                : geocodeError
                ? "We could not determine coverage because we couldn't geocode this ZIP from our database."
                : hasCoverage
                ? "Yes, TG3 will have coverage from FloLive in your area. ✅"
                : "No, TG3 will likely not have coverage from FloLive in your area. ❌"}
            </strong>
          </li>
          {geocodeError && (
            <li style={{ color: "#b91c1c", marginTop: 4, fontSize: 13 }}>
              {geocodeError}
            </li>
          )}
          <li>
            From OCID data, number of TG3-compatible towers in your area:{" "}
            <strong>{filtered.length}</strong>
            {towers.length > 0 && (
              <>
                {" "}
                (out of <strong>{towers.length}</strong> total towers in the
                search area)
              </>
            )}
          </li>
          <li>
            From FCC data, number of total providers found in your area:{" "}
            <strong>{fccProviders.length}</strong>
          </li>
          {fccError && (
            <li style={{ color: "#b91c1c" }}>FCC error: {fccError}</li>
          )}
        </ul>
      </section>

      {/* TG3-compatible towers */}
      {filtered.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>
            From OCID, TG3 compatible towers in your area (first 10)
          </h2>
          <ul style={{ fontSize: 13, lineHeight: 1.5 }}>
            {filtered.slice(0, 10).map((t, i) => {
              const plmn = `${t.mcc}${String(t.mnc).padStart(3, "0")}`;
              const meta = plmnMeta[plmn] || {};
              const operatorName = meta.operatorName || "Unknown operator";
              const imsiProvider =
                meta.imsiProvider || "Unknown IMSI provider";

              return (
                <li key={i}>
                  Radio: <strong>{t.radio ?? "Unknown"}</strong>, MCC: {t.mcc},
                  MNC: {t.mnc}, LAC: {t.lac}, CID: {t.cid}, lat: {t.lat}, lon:{" "}
                  {t.lon}
                  <br />
                  Operator: <strong>{operatorName}</strong> (PLMN {plmn})
                  <br />
                  IMSI provider match: <strong>{imsiProvider}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* FCC Providers */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>
          From FCC data, providers found in your area
        </h2>

        {fccTitle && (
          <p style={{ fontSize: 13, color: "#333", marginBottom: 10 }}>
            {fccTitle}
          </p>
        )}

        {fccProviders.length === 0 && !fccError && (
          <p style={{ fontSize: 13, color: "#555" }}>
            No FCC providers returned yet. Run a check above.
          </p>
        )}

        {fccError && (
          <p style={{ fontSize: 13, color: "#b91c1c" }}>
            FCC error: {fccError}
          </p>
        )}

        {fccProviders.length > 0 && (
          <ul style={{ fontSize: 13, lineHeight: 1.5 }}>
            {fccProviders.map((p) => (
              <li key={p.provider_id ?? p.label}>
                {p.label ? (
                  p.label
                ) : (
                  <>
                    Provider Name:{" "}
                    <strong>{p.provider_name ?? "Unknown"}</strong>, Provider ID:{" "}
                    <code>{p.provider_id ?? "N/A"}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {fccCounties.length > 0 && (
          <>
            <h3 style={{ fontSize: 14, marginTop: 12 }}>
              From FCC data, these are the counties we looked at that contain
              your ZIP code
            </h3>
            <ul style={{ fontSize: 13, lineHeight: 1.5 }}>
              {fccCounties.map((c, i) => (
                <li key={i}>{typeof c === "string" ? c : String(c)}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
        Tip: add <code>/public/favicon.ico</code> to silence the favicon 404.
      </p>
    </main>
  );
}
