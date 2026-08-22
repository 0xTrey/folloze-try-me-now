import { describe, expect, it, vi } from "vitest";
import {
  canStartExternalWork,
  runPreviewWorkerWave
} from "./preview-worker-coordinator";

describe("runPreviewWorkerWave", () => {
  it("starts independent workers concurrently and returns evidence receipts", async () => {
    let active = 0;
    let peak = 0;
    const task = (worker: "brand-identity" | "source-intelligence") => ({
      worker,
      timeoutMs: 100,
      run: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { value: worker, evidenceRefs: [{ id: `${worker}-evidence` }], confidence: 0.9 };
      }
    });
    const results = await runPreviewWorkerWave([task("brand-identity"), task("source-intelligence")], {
      fingerprint: "v1",
      currentFingerprint: () => "v1"
    });
    expect(peak).toBe(2);
    expect(results.map((result) => result.receipt.status)).toEqual(["completed", "completed"]);
    expect(results[0].receipt.evidenceRefs[0]?.id).toBe("brand-identity-evidence");
  });

  it("records timeout without rejecting the wave", async () => {
    const results = await runPreviewWorkerWave([{
      worker: "source-intelligence",
      timeoutMs: 5,
      run: async ({ signal }) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(signal.aborted).toBe(true);
        return "late";
      }
    }], { fingerprint: "v1", currentFingerprint: () => "v1" });
    expect(results[0].receipt.status).toBe("timed_out");
    expect(results[0].receipt.error?.message).toContain("5ms");
  });

  it("discards a result when the input fingerprint changes before completion", async () => {
    let fingerprint = "v1";
    const results = await runPreviewWorkerWave([{
      worker: "message-spine",
      timeoutMs: 100,
      run: async () => {
        fingerprint = "v2";
        return { value: "old copy", artifactRef: "artifact-v1" };
      }
    }], { fingerprint: "v1", currentFingerprint: () => fingerprint });
    expect(results[0].receipt.status).toBe("stale");
    expect(results[0].value).toBeUndefined();
    expect(results[0].receipt.artifactRef).toBe("artifact-v1");
  });

  it("captures worker failures and preserves dependencies", async () => {
    const results = await runPreviewWorkerWave([{
      worker: "composition",
      timeoutMs: 100,
      dependencies: ["brand-identity", "message-spine"],
      run: vi.fn(async () => { throw new TypeError("invalid recipe"); })
    }], { fingerprint: "v1", currentFingerprint: () => "v1" });
    expect(results[0].receipt.status).toBe("failed");
    expect(results[0].receipt.error?.name).toBe("TypeError");
    expect(results[0].receipt.dependencies).toEqual(["brand-identity", "message-spine"]);
  });

  it("turns a synchronously thrown worker into a failed receipt", async () => {
    const results = await runPreviewWorkerWave([{
      worker: "render",
      timeoutMs: 100,
      run: () => { throw new Error("renderer unavailable"); }
    }], { fingerprint: "v1", currentFingerprint: () => "v1" });
    expect(results[0].receipt.status).toBe("failed");
    expect(results[0].receipt.error?.message).toBe("renderer unavailable");
  });

  it("falls back when the shared wave deadline elapses", async () => {
    const results = await runPreviewWorkerWave([{
      worker: "brand-enrichment",
      timeoutMs: 500,
      run: async ({ signal }) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        expect(signal.aborted).toBe(true);
        return { value: "late-brand" };
      }
    }], {
      fingerprint: "v1",
      currentFingerprint: () => "v1",
      waveDeadlineMs: 5
    });
    expect(results[0].receipt.status).toBe("fallback");
    expect(results[0].receipt.fallback).toMatch(/wave deadline/i);
    expect(results[0].value).toBeUndefined();
  });

  it("does not start external work after the shared generation deadline", async () => {
    const factory = vi.fn(async () => ({ value: "should-not-run" }));
    const results = await runPreviewWorkerWave([{
      worker: "account-research",
      timeoutMs: 100,
      run: factory
    }], {
      fingerprint: "v1",
      currentFingerprint: () => "v1",
      externalWorkDeadlineAt: Date.now() - 1
    });
    expect(factory).not.toHaveBeenCalled();
    expect(results[0].receipt.status).toBe("fallback");
    expect(results[0].receipt.fallback).toMatch(/shared generation deadline/i);
    expect(canStartExternalWork(Date.now() - 1)).toBe(false);
    expect(canStartExternalWork(Date.now() + 1_000)).toBe(true);
  });

  it("records optional enrichment failure as a fallback receipt", async () => {
    const results = await runPreviewWorkerWave([{
      worker: "brand-enrichment",
      timeoutMs: 100,
      run: async () => ({
        value: undefined,
        fallback: "Kept the best honest artifact after optional enrichment failed."
      })
    }], { fingerprint: "v1", currentFingerprint: () => "v1" });
    expect(results[0].receipt.status).toBe("fallback");
    expect(results[0].receipt.fallback).toMatch(/best honest artifact/i);
  });
});
