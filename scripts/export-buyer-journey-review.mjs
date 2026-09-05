import fs from "node:fs";
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const text = (value) => typeof value === "string" ? value : undefined;
const items = (input.items ?? []).map((item, i) => ({ reviewId: `review-${i + 1}`, headline: text(item.headline), body: text(item.body), sections: text(item.sections), sourceSnippets: text(item.sourceSnippets) }));
process.stdout.write(JSON.stringify({ version: "buyer-journey-evaluation-v1", questions: ["comprehension", "relevance", "proof", "cta"], items }));
