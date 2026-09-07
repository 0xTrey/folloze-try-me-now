import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const BUILD_FLOW_LEARNING_VERSION = "build-flow-learning-v2";
const MAX_BYTES = 1_000_000, MAX_RECORDS = 100, MAX_LEDGER = 500, MAX_STRING = 8_000;
const text = (value, max = MAX_STRING) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const date = (value) => text(value, 64) && Number.isFinite(Date.parse(value));
const allStringsBounded = (value) => Object.values(value).every((item) => typeof item !== "string" || item.length <= MAX_STRING);
function withinDataLimit(value) { try { return Buffer.byteLength(JSON.stringify(value)) <= MAX_BYTES; } catch { return false; } }
const protectedTokens = (value) => new Set((value.match(/\b\d+(?:[.,]\d+)?%?\b|\b[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*\b/g) ?? []).map((item) => item.toLowerCase()));
const knownClaimText = (record, ledger) => record.evidenceRefs.map((ref) => ledger[ref]?.claimText).filter((value) => typeof value === "string").join(" ");
function noInventedClaims(record, ledger) { const allowed = protectedTokens(`${record.beforeText} ${knownClaimText(record, ledger)}`), changed = protectedTokens(record.afterText); return [...changed].every((token) => allowed.has(token)); }
const unsafeSourceText = (record) => /<script|javascript:|ignore\s+(all\s+)?previous|system\s+prompt|api[ _-]?key/i.test(`${record.beforeText}\n${record.afterText}\n${record.reason}`);

export function validateLearningInput(data) {
  const records = data?.records, ledger = data?.evidenceLedger, trusted = data?.trustedCallerLedger;
  if (!data || data.version !== "build-flow-learning-input-v2" || !Array.isArray(records) || records.length > MAX_RECORDS || !ledger || typeof ledger !== "object" || Array.isArray(ledger) || Object.keys(ledger).length > MAX_LEDGER || !trusted || typeof trusted !== "object" || !text(trusted.version, 200) || !Array.isArray(trusted.entries) || trusted.entries.length > MAX_LEDGER) throw new Error("bounded versioned records, evidenceLedger, and trustedCallerLedger required");
  if (!withinDataLimit(data) || Object.values(ledger).some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry) || !allStringsBounded(entry) || (entry.claimText !== undefined && !text(entry.claimText))) || trusted.entries.some((entry) => !entry || typeof entry !== "object" || !allStringsBounded(entry))) throw new Error("ledger strings exceed bounds");
  const known = new Set(Object.keys(ledger));
  return records.map((record, index) => {
    const reasons = [];
    if (!record || typeof record !== "object" || !allStringsBounded(record)) { reasons.push("invalid_record"); return { index, record, reasons }; }
    if (record.approved !== true) reasons.push("not_approved");
    if (!record.approval || !text(record.approval.reviewer, 200) || !date(record.approval.approvedAt)) reasons.push("invalid_approval");
    for (const key of ["sourceBuild", "sourceVersion", "brandScope", "offerScope", "beforeText", "afterText", "reason", "evidenceDigest", "evidenceVersion"]) if (!text(record[key])) reasons.push(`invalid_${key}`);
    if (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.length === 0 || record.evidenceRefs.length > 50 || record.evidenceRefs.some((ref) => !text(ref, 200) || !known.has(ref))) reasons.push("unknown_evidence_ref");
    const trustedEntry = trusted.entries.some((entry) => entry && entry.brandScope === record.brandScope && entry.offerScope === record.offerScope && entry.evidenceDigest === record.evidenceDigest && entry.evidenceVersion === record.evidenceVersion && entry.sourceBuild === record.sourceBuild && entry.sourceVersion === record.sourceVersion && entry.artifactVersion === BUILD_FLOW_LEARNING_VERSION);
    if (!trustedEntry) reasons.push("untrusted_provenance");
    if (unsafeSourceText(record)) reasons.push("untrusted_source_text");
    if (!reasons.length && !noInventedClaims(record, ledger)) reasons.push("invented_entity_or_number");
    return { index, record, reasons };
  });
}

export function importLearning(data) {
  const checked = validateLearningInput(data), rules = checked.filter((item) => item.reasons.length === 0).map(({ record }) => ({ id: createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 32), approval: record.approval, sourceBuild: record.sourceBuild, sourceVersion: record.sourceVersion, brandScope: record.brandScope, offerScope: record.offerScope, evidenceDigest: record.evidenceDigest, evidenceVersion: record.evidenceVersion, evidenceRefs: record.evidenceRefs, beforeText: record.beforeText, afterText: record.afterText, reason: record.reason }));
  return { version: BUILD_FLOW_LEARNING_VERSION, trustedCallerLedgerVersion: data.trustedCallerLedger.version, rules, rejected: checked.filter((item) => item.reasons.length).map(({ index, reasons }) => ({ index, reasons })) };
}

function assertInsideRepo(repoRoot, candidate, allowMissing) {
  const absolute = path.resolve(repoRoot, candidate), relative = path.relative(repoRoot, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("path must be a file inside the repo");
  const parts = relative.split(path.sep); let current = repoRoot;
  for (const part of parts) { current = path.join(current, part); if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("symlink paths are not allowed"); }
  if (!allowMissing && !fs.existsSync(absolute)) throw new Error("input file does not exist");
  return absolute;
}
function repoRoot(cwd) { return fs.realpathSync(execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()); }
function option(argv, name) { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; }
export function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const inputArg = option(argv, "--input"), outputArg = option(argv, "--output");
  if (!inputArg || !outputArg) throw new Error("--input and --output are required");
  const root = repoRoot(cwd), input = assertInsideRepo(root, inputArg, false), output = assertInsideRepo(root, outputArg, true);
  if (input === output) throw new Error("input and output must be distinct");
  const source = fs.readFileSync(input, "utf8"); if (Buffer.byteLength(source) > MAX_BYTES) throw new Error("input exceeds size limit");
  const artifact = importLearning(JSON.parse(source));
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return artifact;
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) runCli();
