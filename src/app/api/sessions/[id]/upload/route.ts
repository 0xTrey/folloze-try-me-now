import OpenAI, { toFile } from "openai";
import { after, NextRequest, NextResponse } from "next/server";

import { config, hasOpenAI } from "@/lib/config";
import { apiError, noStoreHeaders } from "@/lib/http";
import { canEditSession, patchSessionAnswers, runStoryStage } from "@/lib/orchestrator";
import { anonymousClientKey, enforceRateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

function editorToken(request: NextRequest, id: string): string | undefined {
  const value = request.cookies.get("tmn_editor")?.value;
  if (!value) return undefined;
  const [cookieId, token] = value.split(".", 2);
  return cookieId === id ? token : undefined;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await enforceRateLimit(`upload:${anonymousClientKey(request)}`, 8, 3600);
    if (!(await canEditSession(id, editorToken(request, id)))) {
      return NextResponse.json({ error: "This editor session is no longer active." }, { status: 403 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a PDF to continue.");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("V1 accepts PDF files only.");
    }
    if (file.size > config.maxPdfBytes) throw new Error("That PDF is larger than the 10 MB V1 limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("That file is not a valid PDF.");

    let sourceOpenAIFileId: string | undefined;
    if (hasOpenAI) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const uploaded = await client.files.create({
        file: await toFile(bytes, file.name, { type: "application/pdf" }),
        purpose: "user_data"
      });
      sourceOpenAIFileId = uploaded.id;
    }
    const updated = await patchSessionAnswers(id, {
      sourceName: file.name,
      sourceOpenAIFileId
    });
    if (updated.shouldGenerate) after(() => runStoryStage(id));
    return NextResponse.json(
      { session: updated.session, uploadMode: sourceOpenAIFileId ? "openai-file" : "fixture-metadata" },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    return apiError(error);
  }
}
