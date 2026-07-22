// useFilterPresets unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterPresets, type SavedFilterPreset } from "../useFilterPresets";

// ─── LocalStorage mock ────────────────────────────────
// jsdom (vitest 4.x) does not provide localStorage by default.
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((key: string): string | null => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
  get length() {
    return store.size;
  },
  key: vi.fn((index: number): string | null => Array.from(store.keys())[index] ?? null),
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", mockLocalStorage);
});

// ─── Helpers ──────────────────────────────────────────

/** Create a preset filter item for testing */
function makeFilter(name = "Test Filter", expression = "x = 1", active = true) {
  return { name, expression, active };
}

// ─── Tests ────────────────────────────────────────────

describe("useFilterPresets - savePreset", () => {
  it("starts with an empty preset list", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
    expect(result.current.userPresets).toEqual([]);
    expect(result.current.sharedPresets).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("saves a preset with current filters", () => {
    const { result } = renderHook(() => useFilterPresets());
    const filters = [makeFilter("A", "a = 1"), makeFilter("B", "b = 2")];

    let saved: SavedFilterPreset | undefined;
    act(() => {
      saved = result.current.savePreset("My Preset", filters, "A test preset");
    });

    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.presets).toHaveLength(1);
    expect(saved!.name).toBe("My Preset");
    expect(saved!.description).toBe("A test preset");
    expect(saved!.filters).toEqual(filters);
    expect(saved!.userId).toBe("default");
    expect(saved!.shared).toBe(false);
    expect(saved!.id).toBeTruthy();
    expect(saved!.createdAt).toBeTruthy();
    expect(saved!.updatedAt).toBeTruthy();
  });

  it("saves with empty description when omitted", () => {
    const { result } = renderHook(() => useFilterPresets());
    const filters = [makeFilter()];

    let saved: SavedFilterPreset | undefined;
    act(() => {
      saved = result.current.savePreset("No Desc", filters);
    });

    expect(saved!.description).toBe("");
  });

  it("persists presets in localStorage", () => {
    const { result, unmount } = renderHook(() => useFilterPresets());
    const filters = [makeFilter()];

    act(() => {
      result.current.savePreset("Persisted", filters);
    });
    expect(result.current.userPresets).toHaveLength(1);
    unmount();

    // Re-mount — should read from localStorage
    const { result: result2 } = renderHook(() => useFilterPresets());
    expect(result2.current.userPresets).toHaveLength(1);
    expect(result2.current.userPresets[0].name).toBe("Persisted");
  });

  it("saves multiple presets", () => {
    const { result } = renderHook(() => useFilterPresets());

    act(() => {
      result.current.savePreset("First", [makeFilter("A")]);
      result.current.savePreset("Second", [makeFilter("B")]);
    });

    expect(result.current.userPresets).toHaveLength(2);
    expect(result.current.userPresets[0].name).toBe("First");
    expect(result.current.userPresets[1].name).toBe("Second");
  });

  it("saves for a specific user ID", () => {
    const { result } = renderHook(() => useFilterPresets({ userId: "alice" }));

    act(() => {
      result.current.savePreset("Alice's Preset", [makeFilter()]);
    });

    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.userPresets[0].userId).toBe("alice");
    expect(result.current.presets).toHaveLength(1);
  });
});

describe("useFilterPresets - loadPreset", () => {
  it("returns filters for a saved preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    const filters = [makeFilter("A", "a = 1", true)];

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("Test", filters);
      savedId = saved.id;
    });

    const loaded = result.current.loadPreset(savedId);
    expect(loaded).toEqual(filters);
  });

  it("returns undefined for non-existent preset", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.loadPreset("nonexistent")).toBeUndefined();
  });
});

describe("useFilterPresets - deletePreset", () => {
  it("deletes a preset owned by the user", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("To Delete", [makeFilter()]);
      savedId = saved.id;
      result.current.savePreset("Keep Me", [makeFilter()]);
    });
    expect(result.current.userPresets).toHaveLength(2);

    act(() => {
      result.current.deletePreset(savedId);
    });
    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.userPresets[0].name).toBe("Keep Me");
  });

  it("does nothing when deleting a non-existent preset", () => {
    const { result } = renderHook(() => useFilterPresets());

    act(() => {
      result.current.savePreset("Test", [makeFilter()]);
    });
    expect(result.current.userPresets).toHaveLength(1);

    act(() => {
      result.current.deletePreset("nonexistent");
    });
    expect(result.current.userPresets).toHaveLength(1);
  });

  it("does not delete presets owned by another user", () => {
    // Create a preset as user A
    const { result: resultA } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    let savedId = "";
    act(() => {
      const saved = resultA.current.savePreset("Alice's", [makeFilter()]);
      savedId = saved.id;
    });

    // Try to delete as user B
    const { result: resultB } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );
    // Wait — presets are stored per-user, so bob can't see alice's in their own storage
    // The delete only operates on the current user's storage
    act(() => {
      resultB.current.deletePreset(savedId);
    });

    // Alice's preset should still exist
    const { result: resultA2 } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    expect(resultA2.current.userPresets).toHaveLength(1);
  });
});

describe("useFilterPresets - toggleShare", () => {
  it("toggles a preset's shared flag", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("Shareable", [makeFilter()]);
      savedId = saved.id;
    });
    expect(result.current.userPresets[0].shared).toBe(false);

    act(() => {
      result.current.toggleShare(savedId);
    });
    expect(result.current.userPresets[0].shared).toBe(true);

    act(() => {
      result.current.toggleShare(savedId);
    });
    expect(result.current.userPresets[0].shared).toBe(false);
  });

  it("does not toggle share for presets owned by another user", () => {
    const { result: resultA } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    let savedId = "";
    act(() => {
      const saved = resultA.current.savePreset("Alice's", [makeFilter()]);
      savedId = saved.id;
    });

    const { result: resultB } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );
    // resultB can't see alice's preset in their storage, so toggle does nothing
    act(() => {
      resultB.current.toggleShare(savedId);
    });

    // Alice's preset should still be unshared
    const { result: resultA2 } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    expect(resultA2.current.userPresets[0].shared).toBe(false);
  });
});

describe("useFilterPresets - updatePreset", () => {
  it("updates a preset's name", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("Old Name", [makeFilter()]);
      savedId = saved.id;
    });

    act(() => {
      result.current.updatePreset(savedId, { name: "New Name" });
    });

    expect(result.current.userPresets[0].name).toBe("New Name");
  });

  it("updates a preset's description", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("Test", [makeFilter()]);
      savedId = saved.id;
    });

    act(() => {
      result.current.updatePreset(savedId, { description: "New description" });
    });

    expect(result.current.userPresets[0].description).toBe("New description");
  });

  it("updates both name and description", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("Old", [makeFilter()], "Old desc");
      savedId = saved.id;
    });

    act(() => {
      result.current.updatePreset(savedId, {
        name: "New",
        description: "New desc",
      });
    });

    expect(result.current.userPresets[0].name).toBe("New");
    expect(result.current.userPresets[0].description).toBe("New desc");
  });

  it("does not update presets owned by another user", () => {
    const { result: resultA } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    let savedId = "";
    act(() => {
      const saved = resultA.current.savePreset("Alice's", [makeFilter()]);
      savedId = saved.id;
    });

    const { result: resultB } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );
    act(() => {
      resultB.current.updatePreset(savedId, { name: "Bob's" });
    });

    const { result: resultA2 } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    expect(resultA2.current.userPresets[0].name).toBe("Alice's");
  });
});

describe("useFilterPresets - sharedPresets visibility", () => {
  it("shows shared presets from other users", () => {
    // Alice saves and shares a preset
    const { result: alice } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    act(() => {
      const saved = alice.current.savePreset("Alice's Shared", [
        makeFilter("A", "status = 'Active'"),
      ]);
      alice.current.toggleShare(saved.id);
    });

    // Bob should see Alice's shared preset
    const { result: bob } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );
    expect(bob.current.sharedPresets).toHaveLength(1);
    expect(bob.current.sharedPresets[0].name).toBe("Alice's Shared");
    expect(bob.current.userPresets).toHaveLength(0);
  });

  it("does not show unshared presets from other users", () => {
    const { result: alice } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    act(() => {
      alice.current.savePreset("Alice's Private", [makeFilter()]);
    });

    const { result: bob } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );
    expect(bob.current.sharedPresets).toHaveLength(0);
    expect(bob.current.presets).toHaveLength(0);
  });

  it("does not show own presets in sharedPresets", () => {
    const { result } = renderHook(() => useFilterPresets());

    let savedId = "";
    act(() => {
      const saved = result.current.savePreset("My Shared", [makeFilter()]);
      savedId = saved.id;
      result.current.toggleShare(savedId);
    });

    // Own presets should be in userPresets, not sharedPresets
    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.sharedPresets).toHaveLength(0);
  });
});

describe("useFilterPresets - per-user isolation", () => {
  it("isolates presets by user ID", () => {
    const { result: alice } = renderHook(() =>
      useFilterPresets({ userId: "alice" })
    );
    const { result: bob } = renderHook(() =>
      useFilterPresets({ userId: "bob" })
    );

    act(() => {
      alice.current.savePreset("Alice's", [makeFilter("A")]);
      bob.current.savePreset("Bob's", [makeFilter("B")]);
    });

    expect(alice.current.userPresets).toHaveLength(1);
    expect(alice.current.userPresets[0].name).toBe("Alice's");
    expect(bob.current.userPresets).toHaveLength(1);
    expect(bob.current.userPresets[0].name).toBe("Bob's");
  });

  it("defaults to 'default' user ID", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.savePreset("Default User", [makeFilter()]);
    });
    expect(result.current.userPresets[0].userId).toBe("default");
  });
});

describe("useFilterPresets - custom storage key", () => {
  it("uses a custom storage key prefix", () => {
    const { result } = renderHook(() =>
      useFilterPresets({ storageKey: "custom-prefix" })
    );

    act(() => {
      result.current.savePreset("Custom", [makeFilter()]);
    });

    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.userPresets[0].name).toBe("Custom");
  });
});

describe("useFilterPresets - edge cases", () => {
  it("handles corrupted localStorage gracefully", () => {
    // Put corrupted data in storage
    localStorage.setItem("roastery:filter-presets:default", "not-json");
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });

  it("handles localStorage.getItem throwing", () => {
    const origGetItem = mockLocalStorage.getItem;
    mockLocalStorage.getItem = vi.fn(() => {
      throw new Error("storage error");
    });
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
    mockLocalStorage.getItem = origGetItem;
  });

  it("handles localStorage.setItem throwing", () => {
    const origSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = vi.fn(() => {
      throw new Error("storage full");
    });
    const { result } = renderHook(() => useFilterPresets());
    // Should not crash
    act(() => {
      result.current.savePreset("Test", [makeFilter()]);
    });
    // Preset won't be saved but no error should be thrown
    expect(result.current.userPresets).toHaveLength(0);
    mockLocalStorage.setItem = origSetItem;
  });

  it("saves preset with empty filters array", () => {
    const { result } = renderHook(() => useFilterPresets());
    act(() => {
      result.current.savePreset("Empty", []);
    });
    // Check that the preset was saved to localStorage
    const raw = localStorage.getItem("roastery:filter-presets:default");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Empty");
    expect(parsed[0].filters).toEqual([]);
    // Check that the hook exposes it
    expect(result.current.userPresets).toHaveLength(1);
    expect(result.current.userPresets[0].filters).toEqual([]);
  });
});