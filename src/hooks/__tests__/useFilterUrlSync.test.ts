// useFilterUrlSync unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import {
  useFilterUrlSync,
  serializeFilters,
  deserializeFilters,
  readFiltersFromUrl,
  writeFiltersToUrl,
} from "../useFilterUrlSync";
import type { FilterItem } from "../useFilters";

// ── Pure function tests ───────────────────────────────

describe("serializeFilters", () => {
  it("serializes an empty array to '[]'", () => {
    expect(serializeFilters([])).toBe("[]");
  });

  it("serializes filters with compact keys", () => {
    const filters: FilterItem[] = [
      { id: "f1", name: "Active", expression: "status = 'Active'", active: true },
    ];
    const result = serializeFilters(filters);
    expect(result).toBe('[{"n":"Active","e":"status = \'Active\'","a":true}]');
  });

  it("serializes multiple filters", () => {
    const filters: FilterItem[] = [
      { id: "f1", name: "A", expression: "a = 1", active: true },
      { id: "f2", name: "B", expression: "b = 2", active: false },
    ];
    const result = serializeFilters(filters);
    expect(result).toBe(
      '[{"n":"A","e":"a = 1","a":true},{"n":"B","e":"b = 2","a":false}]'
    );
  });
});

describe("deserializeFilters", () => {
  it("deserializes a valid JSON array", () => {
    const raw = '[{"n":"Active","e":"status = \'Active\'","a":true}]';
    const result = deserializeFilters(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Active");
    expect(result[0].expression).toBe("status = 'Active'");
    expect(result[0].active).toBe(true);
    expect(result[0].id).toMatch(/^url_filter_\d+$/);
  });

  it("returns empty array for invalid JSON", () => {
    expect(deserializeFilters("not-json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(deserializeFilters('{"n":"test"}')).toEqual([]);
  });

  it("handles missing fields gracefully", () => {
    const raw = '[{"n":"Only Name"}]';
    const result = deserializeFilters(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Only Name");
    expect(result[0].expression).toBe("");
    expect(result[0].active).toBe(true); // default
  });

  it("round-trips serialize/deserialize", () => {
    const original: FilterItem[] = [
      { id: "x", name: "Alpha", expression: "x > 5", active: true },
      { id: "y", name: "Beta", expression: "y = 'hello'", active: false },
    ];
    const serialized = serializeFilters(original);
    const deserialized = deserializeFilters(serialized);
    expect(deserialized).toHaveLength(2);
    expect(deserialized[0].name).toBe("Alpha");
    expect(deserialized[0].expression).toBe("x > 5");
    expect(deserialized[0].active).toBe(true);
    expect(deserialized[1].name).toBe("Beta");
    expect(deserialized[1].expression).toBe("y = 'hello'");
    expect(deserialized[1].active).toBe(false);
  });
});

// ── URL helpers (use jsdom's window.location) ─────────

describe("readFiltersFromUrl / writeFiltersToUrl", () => {
  beforeEach(() => {
    // Reset to a clean URL before each test
    window.history.replaceState({}, "", "/");
  });

  it("readFiltersFromUrl returns [] when no filters param", () => {
    expect(readFiltersFromUrl()).toEqual([]);
  });

  it("writeFiltersToUrl writes filters and readFiltersFromUrl reads them back", () => {
    const filters: FilterItem[] = [
      { id: "f1", name: "Test", expression: "x = 1", active: true },
    ];
    writeFiltersToUrl(filters);
    const params = new URLSearchParams(window.location.search);
    expect(params.has("filters")).toBe(true);
    const restored = readFiltersFromUrl();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Test");
    expect(restored[0].expression).toBe("x = 1");
    expect(restored[0].active).toBe(true);
  });

  it("writeFiltersToUrl removes the param when filters are empty", () => {
    // First write some filters
    writeFiltersToUrl([
      { id: "f1", name: "A", expression: "a = 1", active: true },
    ]);
    expect(window.location.search).toContain("filters");
    // Then clear them
    writeFiltersToUrl([]);
    expect(window.location.search).not.toContain("filters");
  });

  it("readFiltersFromUrl handles pre-set URL with filters", () => {
    window.history.replaceState(
      {},
      "",
      "/?filters=%5B%7B%22n%22%3A%22Active%22%2C%22e%22%3A%22status%20%3D%20'Active'%22%2C%22a%22%3Atrue%7D%5D"
    );
    const restored = readFiltersFromUrl();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Active");
    expect(restored[0].expression).toBe("status = 'Active'");
    expect(restored[0].active).toBe(true);
  });

  it("multiple filters round-trip through URL", () => {
    const filters: FilterItem[] = [
      { id: "f1", name: "A", expression: "a = 1", active: true },
      { id: "f2", name: "B", expression: "b = 2", active: false },
    ];
    writeFiltersToUrl(filters);
    const restored = readFiltersFromUrl();
    expect(restored).toHaveLength(2);
    expect(restored[0].name).toBe("A");
    expect(restored[0].active).toBe(true);
    expect(restored[1].name).toBe("B");
    expect(restored[1].active).toBe(false);
  });
});

// ── Hook tests ────────────────────────────────────────

describe("useFilterUrlSync", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("restores filters from URL on mount", () => {
    // Pre-set URL with filters
    window.history.replaceState(
      {},
      "",
      "/?filters=%5B%7B%22n%22%3A%22Active%22%2C%22e%22%3A%22status%20%3D%20'Active'%22%2C%22a%22%3Atrue%7D%5D"
    );

    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    // The hook should have restored the filter from the URL
    expect(result.current.filters).toHaveLength(1);
    expect(result.current.filters[0].name).toBe("Active");
    expect(result.current.filters[0].expression).toBe("status = 'Active'");
    expect(result.current.filters[0].active).toBe(true);
  });

  it("restores multiple filters from URL on mount", () => {
    window.history.replaceState(
      {},
      "",
      "/?filters=%5B%7B%22n%22%3A%22A%22%2C%22e%22%3A%22a%20%3D%201%22%2C%22a%22%3Atrue%7D%2C%7B%22n%22%3A%22B%22%2C%22e%22%3A%22b%20%3D%202%22%2C%22a%22%3Afalse%7D%5D"
    );

    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    expect(result.current.filters).toHaveLength(2);
    expect(result.current.filters[0].name).toBe("A");
    expect(result.current.filters[0].active).toBe(true);
    expect(result.current.filters[1].name).toBe("B");
    expect(result.current.filters[1].active).toBe(false);
  });

  it("does nothing on mount when no filters in URL", () => {
    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    expect(result.current.filters).toEqual([]);
    expect(window.location.search).not.toContain("filters");
  });

  it("writes filters to URL when state changes", () => {
    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    // Initially no filters in URL
    expect(window.location.search).not.toContain("filters");

    // Add a filter
    act(() => {
      result.current.setFilters([
        { id: "f1", name: "Test", expression: "x = 1", active: true },
      ]);
    });

    // URL should now contain the encoded filter
    expect(window.location.search).toContain("filters");
    const restored = readFiltersFromUrl();
    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe("Test");
  });

  it("removes filters param from URL when filters are cleared", () => {
    // Start with a filter in the URL
    window.history.replaceState(
      {},
      "",
      "/?filters=%5B%7B%22n%22%3A%22A%22%2C%22e%22%3A%22a%20%3D%201%22%2C%22a%22%3Atrue%7D%5D"
    );

    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    // Filter was restored
    expect(result.current.filters).toHaveLength(1);

    // Clear the filters
    act(() => {
      result.current.setFilters([]);
    });

    // URL param should be removed
    expect(window.location.search).not.toContain("filters");
  });

  it("does not write to URL when enabled is false", () => {
    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters, { enabled: false });
      return { filters, setFilters };
    });

    // Add a filter
    act(() => {
      result.current.setFilters([
        { id: "f1", name: "Test", expression: "x = 1", active: true },
      ]);
    });

    // URL should NOT have the filters param
    expect(window.location.search).not.toContain("filters");
  });

  it("does not restore from URL when enabled is false", () => {
    window.history.replaceState(
      {},
      "",
      "/?filters=%5B%7B%22n%22%3A%22Active%22%2C%22e%22%3A%22status%20%3D%20'Active'%22%2C%22a%22%3Atrue%7D%5D"
    );

    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters, { enabled: false });
      return { filters, setFilters };
    });

    // Filters should NOT have been restored from URL
    expect(result.current.filters).toEqual([]);
  });

  it("avoids feedback loop when setFilters is called with already-synced state", () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => {
      const [filters, setFilters] = useState<FilterItem[]>([]);
      useFilterUrlSync(filters, setFilters);
      return { filters, setFilters };
    });

    // Clear the initial replaceState call count
    replaceStateSpy.mockClear();

    // Call setFilters with the same filters that were already synced
    act(() => {
      result.current.setFilters([]);
    });

    // Should not call replaceState (no-op since empty matched lastWritten)
    expect(replaceStateSpy).not.toHaveBeenCalled();

    replaceStateSpy.mockRestore();
  });
});