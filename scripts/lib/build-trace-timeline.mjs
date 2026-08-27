/**
 * Renders a retained BuildTrace as operator-readable text.
 *
 * Plain JavaScript so the server-only CLI can run it with no build step. The
 * renderer is also the last privacy boundary: every value printed is passed
 * through `safe`, so a malformed stored row degrades to `[withheld]` instead
 * of leaking whatever it happened to contain.
 */

/** Codes, enums, digests, refs, and timestamps. Nothing free-form. */
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:@+-]{0,127}$/;

function safe(value) {
  if (value === undefined || value === null) return "-";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string") return "[withheld]";
  return SAFE_TOKEN.test(value) ? value : "[withheld]";
}

function safeList(values) {
  if (!Array.isArray(values) || !values.length) return "";
  return values.map((value) => safe(value)).join(", ");
}

function pad(value, width) {
  const text = safe(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export function renderBuildTraceTimeline(trace) {
  if (!trace || typeof trace !== "object") return "Build [withheld]: unreadable trace record";

  const lines = [];
  const heading = (label) => lines.push("", label);
  const item = (text) => lines.push(`  ${text}`);

  lines.push(
    `Build ${safe(trace.attemptId)}`,
    `  trace        ${safe(trace.traceId)}`,
    `  session      ${safe(trace.sessionId)}`,
    `  revision     ${safe(trace.revision)}`,
    `  pipeline     ${safe(trace.pipelineVersion)} (schema v${safe(trace.schemaVersion)})`,
    `  status       ${safe(trace.terminalStatus)}`,
    `  started      ${safe(trace.startedAt)}`,
    `  completed    ${safe(trace.completedAt)}`,
    `  evidence     ${(trace.evidenceRefs ?? []).length} ref(s)`
  );

  heading("Timeline");
  const timings = trace.timings ?? [];
  if (!timings.length) item("no stage timings recorded");
  for (const timing of timings) {
    item(`${pad(timing.stage, 28)} ${String(safe(timing.durationMs)).padStart(6)}ms  ${safe(timing.status)}`);
  }

  heading("Decisions");
  const ranked = [trace.decisions?.framework, trace.decisions?.wireframe].filter(Boolean);
  if (!ranked.length) item("no ranked decisions recorded");
  for (const decision of ranked) {
    const candidates = decision.candidates ?? [];
    item(
      `${pad(decision.decision, 12)}${safe(decision.selectedCandidateId)} `
      + `(${candidates.length} candidate(s), confidence ${safe(decision.confidence)})`
    );
    const reasons = safeList(decision.reasonCodes);
    if (reasons) item(`${" ".repeat(12)}reasons: ${reasons}`);
    for (const candidate of candidates) {
      const marker = candidate.candidateId === decision.selectedCandidateId ? "*" : " ";
      item(`${" ".repeat(12)}${marker} ${pad(candidate.candidateId, 24)} score ${safe(candidate.score)}`);
    }
  }

  heading("Brand roles");
  const brand = trace.decisions?.brand;
  if (!brand) {
    item("no brand decision recorded");
  } else {
    item(`readiness ${safe(brand.readiness)} (confidence ${safe(brand.confidence)})`);
    for (const role of brand.roles ?? []) {
      item(
        `${pad(role.role, 18)} ${pad(role.valueDigest, 36)} ${pad(role.sourceAuthority, 20)} `
        + `conf ${safe(role.confidence)}  ${safeList(role.selectionReasons)}`
      );
    }
    const warnings = safeList(brand.warnings);
    if (warnings) item(`warnings: ${warnings}`);
  }

  heading("Asset allocations");
  const assets = trace.decisions?.assets;
  if (!assets) {
    item("no asset allocation recorded");
  } else {
    item(
      `${safe(assets.substantiveCount)} substantive, ${safe(assets.reusableCount)} reusable, `
      + `${safe(assets.rejectedCount)} rejected`
    );
    for (const allocation of assets.allocations ?? []) {
      item(
        `${pad(allocation.sectionId, 18)} ${pad(allocation.semanticRole, 12)} `
        + `${pad(allocation.assetDigest, 36)} score ${safe(allocation.score)}`
        + `${allocation.reusable ? "  (reusable)" : ""}`
      );
    }
    const rejections = safeList(assets.rejectionReasons);
    if (rejections) item(`rejections: ${rejections}`);
  }

  heading("Sections");
  const sections = trace.sections ?? [];
  if (!sections.length) item("no section provenance recorded");
  for (const section of sections) {
    item(
      `${pad(section.sectionId, 20)} ${pad(section.role, 20)} ${pad(section.status, 10)} `
      + `${safe(section.writerMode)}`
    );
    item(
      `${" ".repeat(20)} prompt ${safe(section.promptVersion)}  `
      + `template ${safe(section.templateVersion)}`
    );
    item(
      `${" ".repeat(20)} in ${safe(section.inputDigest)}  out ${safe(section.outputDigest)}  `
      + `candidate ${safe(section.selectedCandidate)} of ${(section.candidateDigests ?? []).length}`
    );
    const reasons = safeList(section.selectionReasons);
    if (reasons) item(`${" ".repeat(20)} reasons: ${reasons}`);
    if (section.fallbackCode) item(`${" ".repeat(20)} fallback: ${safe(section.fallbackCode)}`);
  }

  heading("Quality");
  const quality = trace.quality ?? [];
  if (!quality.length) item("no quality results recorded");
  for (const result of quality) {
    item(`${pad(result.dimension, 28)} score ${safe(result.score)}  (never blocking)`);
    const warnings = safeList(result.warnings);
    if (warnings) item(`${" ".repeat(28)} warnings: ${warnings}`);
    const violations = safeList(result.violations);
    if (violations) item(`${" ".repeat(28)} violations: ${violations}`);
  }

  heading("Fallbacks");
  const fallbacks = trace.fallbacks ?? [];
  if (!fallbacks.length) item("none");
  for (const fallback of fallbacks) {
    item(
      `${safe(fallback.at)}  ${pad(fallback.stage, 28)} ${pad(fallback.scope, 10)} `
      + `${safe(fallback.code)}`
    );
  }

  return lines.join("\n");
}

/** Renders one or more attempts, newest first, under a shared support heading. */
export function renderBuildTraceReport(reference, traces) {
  const label = safe(reference);
  if (!traces?.length) return `No retained build trace matches ${label}.`;
  return [
    `Support reference ${label}: ${traces.length} retained build attempt(s)`,
    ...traces.map((trace) => renderBuildTraceTimeline(trace))
  ].join("\n");
}

/** Bounds on a projection, so a malformed row cannot produce an unbounded dump. */
const PROJECTION_LIMITS = {
  timings: 64,
  candidates: 12,
  roles: 32,
  allocations: 32,
  sections: 24,
  candidateDigests: 8,
  reasons: 12,
  quality: 24,
  fallbacks: 64
};

/**
 * Codes and enums only. Stricter than the timeline renderer: `@` is excluded
 * so an address can never pass, and a value whose last segment reads as a
 * hostname is dropped even though the character set would allow it.
 */
const PROJECTION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:+-]{0,127}$/;
const HOSTNAME_LIKE = /\.[A-Za-z]{2,}(?::\d+)?$/;

/** A safe string, or nothing at all. Absent beats `[withheld]` in JSON. */
function token(value) {
  if (typeof value !== "string") return undefined;
  if (!PROJECTION_TOKEN.test(value)) return undefined;
  return HOSTNAME_LIKE.test(value) ? undefined : value;
}

function tokens(values, limit) {
  if (!Array.isArray(values)) return [];
  return values
    .slice(0, limit)
    .map((value) => token(value))
    .filter((value) => value !== undefined);
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

/** Drops absent fields so the output is an allowlist, not a shape with holes. */
function compact(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function projectDecision(decision) {
  if (!decision || typeof decision !== "object") return undefined;
  return compact({
    decision: token(decision.decision),
    selectedCandidateId: token(decision.selectedCandidateId),
    confidence: token(decision.confidence) ?? number(decision.confidence),
    reasonCodes: tokens(decision.reasonCodes, PROJECTION_LIMITS.reasons),
    candidates: (Array.isArray(decision.candidates) ? decision.candidates : [])
      .slice(0, PROJECTION_LIMITS.candidates)
      .map((candidate) =>
        compact({
          candidateId: token(candidate?.candidateId),
          score: number(candidate?.score),
          reasonCodes: tokens(candidate?.reasonCodes, PROJECTION_LIMITS.reasons)
        })
      )
  });
}

/**
 * Projects a stored trace into the operator-visible JSON view.
 *
 * This is an allowlist, not a redaction pass. Every field is named here and
 * every value is a code, enum, digest, count, or timestamp, so a future field
 * added upstream cannot reach an operator's terminal until someone adds it
 * deliberately. Anything that fails the safe-token test is dropped entirely.
 */
export function projectBuildTraceForInspection(trace) {
  if (!trace || typeof trace !== "object") return undefined;
  const decisions = trace.decisions ?? {};
  const brand = decisions.brand;
  const assets = decisions.assets;
  return compact({
    schemaVersion: token(trace.schemaVersion) ?? number(trace.schemaVersion),
    pipelineVersion: token(trace.pipelineVersion),
    attemptId: token(trace.attemptId),
    traceId: token(trace.traceId),
    sessionId: token(trace.sessionId),
    revision: number(trace.revision),
    terminalStatus: token(trace.terminalStatus),
    startedAt: token(trace.startedAt),
    completedAt: token(trace.completedAt),
    // Count only. Evidence identifiers carry source hostnames upstream.
    evidenceRefCount: count(trace.evidenceRefs),
    timings: (Array.isArray(trace.timings) ? trace.timings : [])
      .slice(0, PROJECTION_LIMITS.timings)
      .map((timing) =>
        compact({
          stage: token(timing?.stage),
          status: token(timing?.status),
          durationMs: number(timing?.durationMs)
        })
      ),
    decisions: compact({
      framework: projectDecision(decisions.framework),
      wireframe: projectDecision(decisions.wireframe),
      brand: brand
        ? compact({
            readiness: token(brand.readiness),
            confidence: token(brand.confidence) ?? number(brand.confidence),
            warnings: tokens(brand.warnings, PROJECTION_LIMITS.reasons),
            roles: (Array.isArray(brand.roles) ? brand.roles : [])
              .slice(0, PROJECTION_LIMITS.roles)
              .map((role) =>
                compact({
                  role: token(role?.role),
                  valueDigest: token(role?.valueDigest),
                  sourceAuthority: token(role?.sourceAuthority),
                  confidence: number(role?.confidence),
                  selectionReasons: tokens(role?.selectionReasons, PROJECTION_LIMITS.reasons)
                })
              )
          })
        : undefined,
      assets: assets
        ? compact({
            substantiveCount: number(assets.substantiveCount),
            reusableCount: number(assets.reusableCount),
            rejectedCount: number(assets.rejectedCount),
            rejectionReasons: tokens(assets.rejectionReasons, PROJECTION_LIMITS.reasons),
            allocations: (Array.isArray(assets.allocations) ? assets.allocations : [])
              .slice(0, PROJECTION_LIMITS.allocations)
              .map((allocation) =>
                compact({
                  sectionId: token(allocation?.sectionId),
                  semanticRole: token(allocation?.semanticRole),
                  assetDigest: token(allocation?.assetDigest),
                  score: number(allocation?.score),
                  reusable: boolean(allocation?.reusable)
                })
              )
          })
        : undefined
    }),
    sections: (Array.isArray(trace.sections) ? trace.sections : [])
      .slice(0, PROJECTION_LIMITS.sections)
      .map((section) =>
        compact({
          sectionId: token(section?.sectionId),
          role: token(section?.role),
          status: token(section?.status),
          writerMode: token(section?.writerMode),
          promptVersion: token(section?.promptVersion),
          templateVersion: token(section?.templateVersion),
          inputDigest: token(section?.inputDigest),
          outputDigest: token(section?.outputDigest),
          selectedCandidate: token(section?.selectedCandidate)
            ?? number(section?.selectedCandidate),
          candidateCount: count(section?.candidateDigests),
          candidateDigests: tokens(
            section?.candidateDigests,
            PROJECTION_LIMITS.candidateDigests
          ),
          selectionReasons: tokens(section?.selectionReasons, PROJECTION_LIMITS.reasons),
          fallbackCode: token(section?.fallbackCode)
        })
      ),
    quality: (Array.isArray(trace.quality) ? trace.quality : [])
      .slice(0, PROJECTION_LIMITS.quality)
      .map((result) =>
        compact({
          dimension: token(result?.dimension),
          score: number(result?.score),
          blocking: false,
          warnings: tokens(result?.warnings, PROJECTION_LIMITS.reasons),
          violations: tokens(result?.violations, PROJECTION_LIMITS.reasons)
        })
      ),
    fallbacks: (Array.isArray(trace.fallbacks) ? trace.fallbacks : [])
      .slice(0, PROJECTION_LIMITS.fallbacks)
      .map((fallback) =>
        compact({
          at: token(fallback?.at),
          stage: token(fallback?.stage),
          scope: token(fallback?.scope),
          code: token(fallback?.code)
        })
      )
  });
}
