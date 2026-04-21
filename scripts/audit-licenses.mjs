#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
/**
 * Audit frontend dependency licenses for the Engramia dashboard.
 *
 * Runs `license-checker-rseidelsohn --production --json` against the
 * current node_modules/ tree (Next.js 15 + React 19 + Tailwind 4 stack)
 * and regenerates docs/legal/DEPENDENCY_LICENSES.md.
 *
 * Expected release flow (see .github/workflows/docker-publish.yml):
 *
 *     npm ci --omit=dev               # runtime deps only
 *     node scripts/audit-licenses.mjs
 *
 * Modes:
 *     (default)  Regenerate docs/legal/DEPENDENCY_LICENSES.md.
 *     --check    Exit 1 if output would differ from the committed file.
 *     --stdout   Print to stdout instead of writing the file.
 *     --fail-on=high    Exit 2 on HIGH-risk license (default).
 *     --fail-on=none    Disable the risk gate.
 *
 * Risk tiers vs BUSL 1.1 commercial release:
 *     HIGH     AGPL / GPL-3 / SSPL / Commons Clause  — blocks release
 *     MEDIUM   LGPL family                           — dynamic linking
 *                                                      is safe in the
 *                                                      Node/npm model
 *                                                      (same principle
 *                                                      as LGPL in the
 *                                                      Python ecosystem)
 *     LOW      MPL-2.0                               — file-level, safe
 *     OK       MIT / BSD / Apache / ISC / Unlicense  — permissive
 *     UNKNOWN  metadata missing                      — verify manually
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(ROOT, "package.json"), "utf-8"),
);
const SELF_NAME = PACKAGE_JSON.name;
const SELF_VERSION = PACKAGE_JSON.version;
const DEFAULT_OUTPUT = "docs/legal/DEPENDENCY_LICENSES.md";

// Order matters — LGPL must be checked before GPL, since "Lesser GPL"
// contains the token "GPL" that would otherwise match as HIGH.
const MEDIUM = [/\bLGPL/i, /Lesser General/i];
const HIGH = [
  /\bAGPL/i,
  /Affero/i,
  /\bGPL-?3/i,
  /\bGPLv3/i,
  /GNU General Public License v3/i,
  /\bSSPL/i,
  /Server Side Public License/i,
  /Commons Clause/i,
];
const LOW = [/\bMPL\b/i, /Mozilla Public/i];
const OK = [
  /\bMIT\b/i,
  /\bBSD\b/i,
  /\bApache\b/i,
  /\bISC\b/i,
  /\bPSF\b/i,
  /Unlicense/i,
  /\b0BSD\b/i,
  /\bZlib\b/i,
  /\bCC0/i,
  /\bUPL\b/i,
  /\bBlueOak/i,
  /\bPublic Domain\b/i,
  /\bCC-BY/i,
];

const EMOJI = {
  HIGH: "🔴",
  MEDIUM: "🟡",
  LOW: "🟠",
  OK: "✅",
  UNKNOWN: "⚠️",
};
const LABEL = {
  HIGH: "🔴 HIGH",
  MEDIUM: "🟡 MEDIUM",
  LOW: "🟠 LOW",
  OK: "✅ OK",
  UNKNOWN: "⚠️ UNKNOWN",
};
const NOTE = {
  HIGH: "Strong copyleft — incompatible with BUSL 1.1 commercial distribution. Must be removed or replaced before release.",
  MEDIUM:
    "LGPL — applied to a dynamically-linked native library. Node/npm runtime link model does not propagate copyleft to application code. Commercial use is safe.",
  LOW: "MPL-2.0 — file-level copyleft only. Unmodified commercial use is safe; only modified MPL files must be shared.",
  UNKNOWN:
    "License metadata missing or unrecognized. Verify manually before release.",
};
const ORDER = ["HIGH", "MEDIUM", "LOW", "UNKNOWN", "OK"];

function classify(licenseStr) {
  const text = licenseStr ?? "";
  for (const p of MEDIUM) if (p.test(text)) return "MEDIUM";
  for (const p of HIGH) if (p.test(text)) return "HIGH";
  for (const p of LOW) if (p.test(text)) return "LOW";
  for (const p of OK) if (p.test(text)) return "OK";
  return "UNKNOWN";
}

// Platform-suffix pattern on package names — e.g. `@img/sharp-linux-x64`,
// `@img/sharp-libvips-linuxmusl-arm64`, `@next/swc-win32-x64-msvc`.
// Collapsed to `<base>-<platform>` so regeneration on any host OS / libc
// variant produces the same inventory file (see roadmap hotfix).
const PLATFORM_SUFFIX_RE = /-(linux|linuxmusl|darwin|win32|freebsd|android|sunos|netbsd|openbsd)-(x64|arm64|arm|ia32|ppc64|s390x|mips|mipsel|riscv64)(-(gnu|musl|msvc|eabi|eabihf))?$/;

function canonicalizePackageName(name) {
  return PLATFORM_SUFFIX_RE.test(name) ? name.replace(PLATFORM_SUFFIX_RE, "-<platform>") : name;
}

function runLicenseChecker() {
  // Hardcoded argv — no user input, so execSync is safe here and
  // avoids the execFileSync shell-argument deprecation on Windows.
  let raw;
  try {
    raw = execSync("npx --yes license-checker-rseidelsohn --production --json", {
      encoding: "utf-8",
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    console.error(
      "::error::license-checker-rseidelsohn failed to run. Install "
        + "node_modules with `npm ci` first. Underlying error:\n"
        + err.message,
    );
    process.exit(3);
  }
  const data = JSON.parse(raw);
  // Collapse platform-specific variants into a single canonical entry.
  // Only entries whose name actually contains a platform suffix are
  // collapsed — versionied duplicates of the same package (e.g. two
  // `react-is` majors in the same tree) MUST be preserved as separate
  // rows. If several platform builds resolve to the same canonical name
  // (e.g. `@next/swc-linux-x64-gnu` + `@next/swc-linux-x64-musl` on a
  // multi-libc install), keep the highest-risk one.
  const canonical = new Map();
  const rest = [];
  for (const key of Object.keys(data)) {
    const match = key.match(/^(.+)@([^@]+)$/);
    const rawName = match ? match[1] : key;
    const version = match ? match[2] : "";
    if (rawName === SELF_NAME) continue;
    const licenses = data[key].licenses;
    const licenseStr = Array.isArray(licenses) ? licenses.join(" AND ") : (licenses ?? "UNKNOWN");
    const name = canonicalizePackageName(rawName);
    const entry = { name, version, license: licenseStr, risk: classify(licenseStr) };
    if (name === rawName) {
      rest.push(entry);
      continue;
    }
    const existing = canonical.get(name);
    if (!existing || ORDER.indexOf(entry.risk) < ORDER.indexOf(existing.risk)) {
      canonical.set(name, entry);
    }
  }
  const pkgs = [...rest, ...canonical.values()];
  pkgs.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return pkgs;
}

function renderMarkdown(packages, today) {
  const counts = Object.fromEntries(ORDER.map((r) => [r, 0]));
  for (const p of packages) counts[p.risk] += 1;
  const flagged = packages.filter((p) => p.risk !== "OK");

  const buf = [];
  buf.push("# Dependency License Inventory — Engramia Dashboard");
  buf.push("");
  buf.push(
    `Generated: ${today}  |  Dashboard version: ${SELF_VERSION}`,
  );
  buf.push("");
  buf.push(
    "Runtime frontend dependencies shipped in the "
      + "`ghcr.io/engramia/dashboard` Docker image. Auto-generated by "
      + "[`scripts/audit-licenses.mjs`](../../scripts/audit-licenses.mjs) "
      + "against `node_modules/` installed with `npm ci --omit=dev` "
      + "(runtime closure only — no devDependencies). Do not edit "
      + "manually; CI will reject drift.",
  );
  buf.push("");
  buf.push(
    "Python runtime dependencies (Core library + API) are audited "
      + "separately in the Core repo: "
      + "[engramia/engramia → docs/legal/DEPENDENCY_LICENSES.md]"
      + "(https://github.com/engramia/engramia/blob/main/docs/legal/DEPENDENCY_LICENSES.md).",
  );
  buf.push("");

  buf.push("## Summary");
  buf.push("");
  buf.push("| | Count |");
  buf.push("|---|---|");
  buf.push(`| npm packages (runtime transitive closure) | ${packages.length} |`);
  buf.push(`| 🔴 HIGH — must resolve before release | ${counts.HIGH} |`);
  buf.push(`| 🟡 MEDIUM — review required | ${counts.MEDIUM} |`);
  buf.push(`| 🟠 LOW — safe, note only | ${counts.LOW} |`);
  buf.push(`| ⚠️ UNKNOWN — verify manually | ${counts.UNKNOWN} |`);
  buf.push(`| ✅ OK | ${counts.OK} |`);
  buf.push("");
  if (counts.HIGH === 0 && counts.UNKNOWN === 0) {
    buf.push(
      "**Result: no blocking issues. All flagged packages are safe for "
        + "commercial distribution under BUSL 1.1 (see notes below).**",
    );
  } else if (counts.HIGH === 0) {
    buf.push(
      `**Result: no blocking issues. ${counts.UNKNOWN} package(s) have `
        + "unrecognized license metadata and need manual review.**",
    );
  } else {
    buf.push(
      `**Result: ${counts.HIGH} HIGH-risk package(s) detected. Release `
        + "is BLOCKED until these are removed or replaced.**",
    );
  }
  buf.push("");

  if (flagged.length > 0) {
    buf.push("## Flagged packages");
    buf.push("");
    buf.push("| Risk | Package | Version | License | Assessment |");
    buf.push("|---|---|---|---|---|");
    const sorted = [...flagged].sort(
      (a, b) =>
        ORDER.indexOf(a.risk) - ORDER.indexOf(b.risk)
        || a.name.localeCompare(b.name),
    );
    for (const p of sorted) {
      buf.push(
        `| ${LABEL[p.risk]} | ${p.name} | ${p.version} | ${p.license} | ${NOTE[p.risk] ?? ""} |`,
      );
    }
    buf.push("");
  }

  buf.push("## Full list");
  buf.push("");
  buf.push("| Package | Version | License | Risk |");
  buf.push("|---|---|---|---|");
  for (const p of packages) {
    buf.push(`| ${p.name} | ${p.version} | ${p.license} | ${EMOJI[p.risk]} |`);
  }
  buf.push("");

  buf.push("## Update process");
  buf.push("");
  buf.push(
    "- **Release time** — `docker-publish.yml` runs `npm ci --omit=dev` "
      + "and regenerates this file before building the dashboard image.",
  );
  buf.push(
    "- **Pull requests** — `ci.yml` runs "
      + "`node scripts/audit-licenses.mjs --check` to fail if this file "
      + "is stale after a dependency change.",
  );
  buf.push(
    "- **Manual refresh** — `npm ci --omit=dev` then "
      + "`node scripts/audit-licenses.mjs`.",
  );
  buf.push("");
  buf.push("---");
  buf.push("");
  buf.push("*Auto-generated. Do not edit manually.*");
  buf.push("");
  return buf.join("\n");
}

function normalizeForCheck(text) {
  // Drop the Generated/version header line — it's the only thing that
  // varies between identical dependency trees.
  return text.replace(
    /^Generated: [^|]*\|\s*Dashboard version: .*$/m,
    "Generated: <date>  |  Dashboard version: <version>",
  );
}

function parseArgs(argv) {
  const out = {
    output: DEFAULT_OUTPUT,
    check: false,
    stdout: false,
    failOn: "high",
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--check") out.check = true;
    else if (arg === "--stdout") out.stdout = true;
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
    else if (arg.startsWith("--fail-on=")) out.failOn = arg.slice("--fail-on=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(readFileSync(__filename, "utf-8").match(/\/\*\*[\s\S]*?\*\//)[0]);
      process.exit(0);
    } else {
      console.error(`::error::Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const packages = runLicenseChecker();
  const today = new Date().toISOString().slice(0, 10);
  const generated = renderMarkdown(packages, today);
  const high = packages.filter((p) => p.risk === "HIGH").length;
  const unknown = packages.filter((p) => p.risk === "UNKNOWN").length;

  if (args.stdout) {
    process.stdout.write(generated);
  } else if (args.check) {
    const outPath = resolve(ROOT, args.output);
    if (!existsSync(outPath)) {
      console.error(
        `::error::${args.output} does not exist. Run `
          + "`node scripts/audit-licenses.mjs` and commit the result.",
      );
      process.exit(1);
    }
    const existing = readFileSync(outPath, "utf-8");
    if (normalizeForCheck(existing) !== normalizeForCheck(generated)) {
      console.error(
        `::error::${args.output} is stale. A dependency change was `
          + "made without regenerating the audit. Run "
          + "`node scripts/audit-licenses.mjs` locally and commit.",
      );
      process.exit(1);
    }
    console.log(`${args.output} is up to date (${packages.length} packages).`);
  } else {
    const outPath = resolve(ROOT, args.output);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, generated, "utf-8");
    console.log(`${args.output} regenerated — ${packages.length} packages.`);
  }

  if (args.failOn === "high" && high > 0) {
    console.error(`::error::${high} HIGH-risk license(s) present — release blocked.`);
    process.exit(2);
  }
  if (args.failOn === "unknown" && (high > 0 || unknown > 0)) {
    console.error(
      `::error::${high} HIGH, ${unknown} UNKNOWN license(s) — release blocked.`,
    );
    process.exit(2);
  }
}

main();
