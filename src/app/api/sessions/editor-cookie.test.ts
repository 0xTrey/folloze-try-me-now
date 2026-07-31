import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import {
  editorCookieName,
  readEditorToken,
  setEditorTokenCookie
} from "./editor-cookie";

function request(cookie?: string) {
  return new NextRequest("https://preview.example.com/api/sessions/session-a", {
    headers: cookie ? { Cookie: cookie } : undefined
  });
}

describe("session-scoped editor cookies", () => {
  it("keeps two tab sessions independently addressable", () => {
    const twoTabs = request(
      `${editorCookieName("session-a")}=token-a; ${editorCookieName("session-b")}=token-b`
    );

    expect(readEditorToken(twoTabs, "session-a")).toBe("token-a");
    expect(readEditorToken(twoTabs, "session-b")).toBe("token-b");
  });

  it("reads the legacy fixed-name cookie during the transition window", () => {
    const legacy = request("tmn_editor=session-a.legacy-token");

    expect(readEditorToken(legacy, "session-a")).toBe("legacy-token");
    expect(readEditorToken(legacy, "session-b")).toBeUndefined();
  });

  it("issues a 24-hour HttpOnly cookie and bounds the scoped cookie ring", () => {
    const priorIds = ["one", "two", "three", "four", "five"];
    const incoming = request([
      `tmn_editor_index=${priorIds.join(",")}`,
      ...priorIds.map((id) => `${editorCookieName(id)}=token-${id}`)
    ].join("; "));
    const response = NextResponse.json({ ok: true });

    setEditorTokenCookie(incoming, response, "six", "token-six");

    expect(response.cookies.get(editorCookieName("six"))).toMatchObject({
      value: "token-six",
      httpOnly: true,
      sameSite: "lax",
      path: "/api/sessions",
      maxAge: 86_400
    });
    expect(response.cookies.get("tmn_editor_index")?.value).toBe("six,one,two,three,four");
    expect(response.cookies.get(editorCookieName("five"))?.maxAge).toBe(0);
  });
});
