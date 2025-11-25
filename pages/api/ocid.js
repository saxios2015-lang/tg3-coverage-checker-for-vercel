// pages/api/ocid.js

import fs from "fs";
import path from "path";
import csv from "csv-parser";

const DATA_DIR = path.join(process.cwd(), "public", "data");

// Add whichever MCC CSVs you downloaded
const CSV_FILES = ["310.csv", "311.csv", "312.csv", "313.csv", "314.csv"];

// In-memory cache of all cells
let allCells = null;

/**
 * Load all CSV tower rows into memory once.
 * Returns an array of cell objects with OCID-like fields.
 */
async function loadAllCells() {
  if (allCells) return allCells;

  const cells = [];

  const headers = [
    "radio",      // 0
    "mcc",        // 1
    "mnc",        // 2
    "lac",        // 3
    "cid",        // 4
    "unit",       // 5
    "lon",        // 6
    "lat",        // 7
    "range",      // 8
    "samples",    // 9
    "changeable", // 10
    "created",    // 11
    "updated",    // 12
    "avg_signal", // 13
  ];

  for (const file of CSV_FILES) {
    const filePath = path.join(DATA_DIR, file);

    if (!fs.existsSync(filePath)) {
      console.warn(`[OCID LOCAL] File not found: ${filePath}`);
      continue;
    }

    console.log(`[OCID LOCAL] Loading ${filePath} ...`);

    // Wrap the streaming parse in a Promise so we can await it
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csv({
            headers,
            skipLines: 0,
          })
        )
        .on("data", (row) => {
          // Coerce numeric fields
          const lat = parseFloat(row.lat);
          const lon = parseFloat(row.lon);

          if (Number.isNaN(lat) || Number.isNaN(lon)) return;

          row.lat = lat;
          row.lon = lon;
          row.mcc = parseInt(row.mcc, 10);
          row.mnc = parseInt(row.mnc, 10);
          row.lac = parseInt(row.lac, 10);
          row.cid = parseInt(row.cid, 10);
          row.range = parseInt(row.range, 10);
          row.samples = parseInt(row.samples, 10);

          cells.push(row);
        })
        .on("end", resolve)
        .on("error", reject);
    });
  }

  console.log(`[OCID LOCAL] Loaded ${cells.length} cells total.`);
  allCells = cells;
  return allCells;
}

/**
 * API handler: GET /api/ocid?bbox=minLon,minLat,maxLon,maxLat&limit=50
 */
export default async function handler(req, res) {
  try {
    const { bbox, limit = "50" } = req.query;

    if (!bbox) {
      return res.status(400).json({
        error: "Missing bbox. Expected bbox=minLon,minLat,maxLon,maxLat",
      });
    }

    const parts = bbox.split(",").map((v) => parseFloat(v));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return res
        .status(400)
        .json({ error: "Invalid bbox format. Use minLon,minLat,maxLon,maxLat" });
    }

    const [minLon, minLat, maxLon, maxLat] = parts;
    const limitNum = parseInt(limit, 10) || 50;

    const cells = await loadAllCells();

    // Filter by bounding box
    const inBox = [];
    for (const cell of cells) {
      if (
        cell.lat >= minLat &&
        cell.lat <= maxLat &&
        cell.lon >= minLon &&
        cell.lon <= maxLon
      ) {
        inBox.push(cell);
        if (inBox.length >= limitNum) break;
      }
    }

    console.log(
      `[OCID LOCAL] bbox=${bbox}, limit=${limitNum} → ${inBox.length} cells`
    );

    // Match roughly the OpenCellID JSON shape
    return res.status(200).json({
      cells: inBox,
      count: inBox.length,
    });
  } catch (err) {
    console.error("[OCID LOCAL ERROR]", err);
    return res.status(500).json({
      error: "Local OCID lookup failed",
      detail: String(err?.message || err),
    });
  }
}

