import { describe, expect, it } from "vitest";
import { rangeFromSearch } from "./dates";

describe("date ranges", () => {
  it("gera o intervalo completo no fuso de Sao Paulo", () => {
    expect(rangeFromSearch("2026-06-01", "2026-06-10")).toEqual({
      start: "2026-06-01T00:00:00-03:00",
      end: "2026-06-10T23:59:59.999-03:00",
    });
  });
});
