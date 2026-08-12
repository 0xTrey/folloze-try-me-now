#!/usr/bin/env node
// Manual-only control plane. It does not import provider SDKs or read tokens in dry-run.
const args = process.argv.slice(2);
const valid = args.length === 1 && args[0] === "--dry-run" || args.length === 2 && args[0] === "--apply" && args[1] === "--confirm-preview-migration";
if (!valid) { process.stderr.write("invalid_arguments\n"); process.exit(2); }
if (args[0] === "--dry-run") { process.stdout.write(JSON.stringify({ mode: "dry-run", writes: 0, providerAccess: false, next: "supply approved adapters only in a separately reviewed operator harness" }) + "\n"); process.exit(0); }
// Deliberately unavailable until an operator provides separately approved, in-memory
// bindings. This prevents accidental use of ambient credentials or production data.
process.stderr.write("provider_harness_not_bound\n"); process.exit(3);
