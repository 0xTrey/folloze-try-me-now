import { timingSafeEqual } from "node:crypto";

export function hasValidCronAuthorization(request: Pick<Request, "headers">): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
