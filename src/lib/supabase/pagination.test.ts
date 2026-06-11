import { describe, expect, it } from "vitest";
import { fetchAllPages } from "./pagination";

describe("fetchAllPages", () => {
  it("carrega todas as paginas ate encontrar uma pagina incompleta", async () => {
    const rows = Array.from({ length: 7 }, (_, id) => ({ id }));
    const result = await fetchAllPages(
      async (from, to) => ({
        data: rows.slice(from, to + 1),
        error: null,
      }),
      3,
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual(rows);
  });

  it("interrompe e devolve o erro da consulta", async () => {
    const result = await fetchAllPages(async () => ({
      data: null,
      error: { message: "offline" },
    }));

    expect(result.data).toEqual([]);
    expect(result.error?.message).toBe("offline");
  });
});
