export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  // Quoting is not enough to stop Excel/Sheets from evaluating a cell as a
  // formula. Prefix formula-like user input with an apostrophe so exports are
  // always treated as literal text.
  const literal = /^(?:[\t\r ]*[=+\-@]|[\t\r])/.test(normalized)
    ? `'${normalized}`
    : normalized;
  return `"${literal.replaceAll('"', '""')}"`;
}
