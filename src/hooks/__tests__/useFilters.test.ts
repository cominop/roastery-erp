// useFilters unit tests
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilters, type FilterItem } from "../useFilters";

// Reset the module-level id counter between tests
beforeEach(() => {
  // The id counter is module-scoped; we work around it by testing functionally
});

describe("useFilters - addFilter", () => {
  it("starts with an empty filter list", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual([]);
    expect(result.current.activeFilters).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.combinedFilter).toBeUndefined();
  });

  it("adds a filter and returns its id", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Active Customers", "status = 'Active'");
    });
    expect(result.current.filters).toHaveLength(1);
    expect(result.current.filters[0].name).toBe("Active Customers");
    expect(result.current.filters[0].expression).toBe("status = 'Active'");
    expect(result.current.filters[0].active).toBe(true);
    // id is a string starting with "filter_"
    expect(id!).toMatch(/^filter_\d+$/);
  });

  it("adds multiple filters", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("Filter A", "a = 1");
      result.current.addFilter("Filter B", "b = 2");
    });
    expect(result.current.filters).toHaveLength(2);
    expect(result.current.filters[0].name).toBe("Filter A");
    expect(result.current.filters[1].name).toBe("Filter B");
  });
});

describe("useFilters - removeFilter", () => {
  it("removes a filter by id", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("To Remove", "x = 1");
      result.current.addFilter("Keep Me", "y = 2");
    });
    expect(result.current.filters).toHaveLength(2);
    act(() => {
      result.current.removeFilter(id!);
    });
    expect(result.current.filters).toHaveLength(1);
    expect(result.current.filters[0].name).toBe("Keep Me");
  });

  it("does nothing when removing a non-existent id", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.removeFilter("non-existent");
    });
    expect(result.current.filters).toHaveLength(1);
  });
});

describe("useFilters - toggleFilter", () => {
  it("toggles a filter from active to inactive", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Toggle Me", "x = 1");
    });
    expect(result.current.filters[0].active).toBe(true);
    act(() => {
      result.current.toggleFilter(id!);
    });
    expect(result.current.filters[0].active).toBe(false);
  });

  it("toggles a filter from inactive to active", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Toggle Me", "x = 1");
    });
    act(() => {
      result.current.toggleFilter(id!); // off
    });
    expect(result.current.filters[0].active).toBe(false);
    act(() => {
      result.current.toggleFilter(id!); // back on
    });
    expect(result.current.filters[0].active).toBe(true);
  });

  it("only affects the targeted filter", () => {
    const { result } = renderHook(() => useFilters());
    let idA: string;
    let idB: string;
    act(() => {
      idA = result.current.addFilter("A", "a = 1");
      idB = result.current.addFilter("B", "b = 2");
    });
    act(() => {
      result.current.toggleFilter(idA!);
    });
    expect(result.current.filters[0].active).toBe(false);
    expect(result.current.filters[1].active).toBe(true);
  });
});

describe("useFilters - setFilterActive", () => {
  it("sets a filter to active explicitly", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.toggleFilter(id!); // make inactive
    });
    expect(result.current.filters[0].active).toBe(false);
    act(() => {
      result.current.setFilterActive(id!, true);
    });
    expect(result.current.filters[0].active).toBe(true);
  });

  it("sets a filter to inactive explicitly", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.setFilterActive(id!, false);
    });
    expect(result.current.filters[0].active).toBe(false);
  });
});

describe("useFilters - clearFilters", () => {
  it("removes all filters", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("A", "a = 1");
      result.current.addFilter("B", "b = 2");
      result.current.addFilter("C", "c = 3");
    });
    expect(result.current.filters).toHaveLength(3);
    act(() => {
      result.current.clearFilters();
    });
    expect(result.current.filters).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });
});

describe("useFilters - updateFilter", () => {
  it("updates a filter's name", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Old Name", "x = 1");
    });
    act(() => {
      result.current.updateFilter(id!, { name: "New Name" });
    });
    expect(result.current.filters[0].name).toBe("New Name");
    expect(result.current.filters[0].expression).toBe("x = 1"); // unchanged
  });

  it("updates a filter's expression", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.updateFilter(id!, { expression: "x = 2" });
    });
    expect(result.current.filters[0].expression).toBe("x = 2");
    expect(result.current.filters[0].name).toBe("Test"); // unchanged
  });

  it("updates both name and expression", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Old", "x = 1");
    });
    act(() => {
      result.current.updateFilter(id!, { name: "New", expression: "y = 2" });
    });
    expect(result.current.filters[0].name).toBe("New");
    expect(result.current.filters[0].expression).toBe("y = 2");
  });
});

describe("useFilters - setFilters (bulk replace)", () => {
  it("replaces all filters with a new array", () => {
    const { result } = renderHook(() => useFilters());
    const items: FilterItem[] = [
      { id: "a", name: "A", expression: "a = 1", active: true },
      { id: "b", name: "B", expression: "b = 2", active: false },
    ];
    act(() => {
      result.current.setFilters(items);
    });
    expect(result.current.filters).toHaveLength(2);
    expect(result.current.filters[0].name).toBe("A");
    expect(result.current.filters[1].name).toBe("B");
    expect(result.current.filters[1].active).toBe(false);
  });
});

describe("useFilters - activeFilters and hasActiveFilters", () => {
  it("returns only active filters", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("Active", "a = 1");
      const id = result.current.addFilter("Inactive", "b = 2");
      result.current.toggleFilter(id);
    });
    expect(result.current.activeFilters).toHaveLength(1);
    expect(result.current.activeFilters[0].name).toBe("Active");
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("hasActiveFilters is false when no active filters exist", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      const id = result.current.addFilter("Off", "x = 1");
      result.current.setFilterActive(id, false);
    });
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.activeFilters).toEqual([]);
  });
});

describe("useFilters - combinedFilter", () => {
  it("returns undefined when no filters and no baseFilter", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.combinedFilter).toBeUndefined();
  });

  it("returns the baseFilter when no user filters exist", () => {
    const { result } = renderHook(() => useFilters({ baseFilter: "deleted = false" }));
    expect(result.current.combinedFilter).toBe("deleted = false");
  });

  it("combines active filters with AND", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("A", "a = 1");
      result.current.addFilter("B", "b = 2");
    });
    expect(result.current.combinedFilter).toBe("a = 1 AND b = 2");
  });

  it("combines baseFilter + active filters with AND", () => {
    const { result } = renderHook(() =>
      useFilters({ baseFilter: "deleted = false" })
    );
    act(() => {
      result.current.addFilter("A", "status = 'Active'");
      result.current.addFilter("B", "amount > 0");
    });
    expect(result.current.combinedFilter).toBe(
      "deleted = false AND status = 'Active' AND amount > 0"
    );
  });

  it("excludes inactive filters from combinedFilter", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      result.current.addFilter("Active", "a = 1");
      id = result.current.addFilter("Inactive", "b = 2");
    });
    expect(result.current.combinedFilter).toBe("a = 1 AND b = 2");
    act(() => {
      result.current.toggleFilter(id!);
    });
    expect(result.current.combinedFilter).toBe("a = 1");
  });

  it("returns undefined when all filters are toggled off and no baseFilter", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.setFilterActive(id!, false);
    });
    expect(result.current.combinedFilter).toBeUndefined();
  });

  it("returns only baseFilter when all user filters are inactive", () => {
    const { result } = renderHook(() =>
      useFilters({ baseFilter: "deleted = false" })
    );
    let id: string;
    act(() => {
      id = result.current.addFilter("Test", "x = 1");
    });
    act(() => {
      result.current.setFilterActive(id!, false);
    });
    expect(result.current.combinedFilter).toBe("deleted = false");
  });

  it("handles empty expression strings gracefully", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("Empty", ""); // filter with empty expression
    });
    // Empty expression should not contribute to combined filter
    expect(result.current.combinedFilter).toBeUndefined();
  });

  it("recomputes combinedFilter when filters change", () => {
    const { result } = renderHook(() => useFilters());
    let id: string;
    act(() => {
      id = result.current.addFilter("A", "a = 1");
    });
    expect(result.current.combinedFilter).toBe("a = 1");
    act(() => {
      result.current.updateFilter(id!, { expression: "a = 99" });
    });
    expect(result.current.combinedFilter).toBe("a = 99");
  });
});

describe("useFilters - baseFilter stability", () => {
  it("includes baseFilter in combinedFilter even when no user filters exist", () => {
    const { result } = renderHook(() =>
      useFilters({ baseFilter: "company_id = 1" })
    );
    expect(result.current.combinedFilter).toBe("company_id = 1");
  });

  it("always includes baseFilter regardless of user filter toggles", () => {
    const { result } = renderHook(() =>
      useFilters({ baseFilter: "tenant = 5" })
    );
    let id: string;
    act(() => {
      id = result.current.addFilter("User", "x = 1");
    });
    expect(result.current.combinedFilter).toBe("tenant = 5 AND x = 1");
    act(() => {
      result.current.setFilterActive(id!, false);
    });
    expect(result.current.combinedFilter).toBe("tenant = 5");
  });
});

describe("useFilters - addFilter defaults", () => {
  it("new filters are active by default", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.addFilter("Test", "x = 1");
    });
    expect(result.current.filters[0].active).toBe(true);
  });
});

describe("useFilters - clearFilters preserves baseFilter", () => {
  it("combinedFilter still contains baseFilter after clearFilters", () => {
    const { result } = renderHook(() =>
      useFilters({ baseFilter: "tenant = 5" })
    );
    act(() => {
      result.current.addFilter("A", "a = 1");
      result.current.addFilter("B", "b = 2");
    });
    expect(result.current.filters).toHaveLength(2);
    act(() => {
      result.current.clearFilters();
    });
    expect(result.current.filters).toEqual([]);
    // baseFilter is still applied regardless of user filters
    expect(result.current.combinedFilter).toBe("tenant = 5");
  });
});