import { describe, expect, it } from "vitest";

import { csvCell } from "./csv-cell.mjs";

describe("lead CSV cells", () => {
  it.each(["=HYPERLINK(\"https://evil.example\")", "+1+1", "-2+3", "@SUM(A1:A2)", "  =cmd", "\t=cmd", "\r=cmd"])(
    "neutralizes spreadsheet formula input: %s",
    (value) => {
      expect(csvCell(value)).toMatch(/^"'/);
    }
  );

  it("quotes ordinary text without changing it", () => {
    expect(csvCell('Audience "A"')).toBe('"Audience ""A"""');
  });
});
