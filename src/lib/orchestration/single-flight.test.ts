import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  it("deduplicates concurrent identical keys and clears after resolve", async () => {
    const flight = createSingleFlight<string, string>((key) => key.trim().toLowerCase());
    const factory = vi.fn(async () => "brand");
    const [a, b] = await Promise.all([flight.run(" Acme.com ", factory), flight.run("acme.com", factory)]);
    expect([a, b]).toEqual(["brand", "brand"]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(flight.size()).toBe(0);
  });

  it("clears rejected work so a later call can retry", async () => {
    const flight = createSingleFlight<string, string>();
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce("recovered");
    await expect(flight.run("key", factory)).rejects.toThrow("upstream down");
    expect(flight.size()).toBe(0);
    await expect(flight.run("key", factory)).resolves.toBe("recovered");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
