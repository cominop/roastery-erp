// FilterPresetManager unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterPresetManager from "../FilterPresetManager";
import type { SavedFilterPreset, UseFilterPresetsReturn } from "../useFilterPresets";

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

function makePreset(
  overrides: Partial<SavedFilterPreset> = {}
): SavedFilterPreset {
  const now = new Date().toISOString();
  return {
    id: `preset_${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Preset",
    description: "A test preset description",
    filters: [{ name: "Status", expression: "status = 'Active'", active: true }],
    userId: "default",
    shared: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makePresetsApi(
  overrides: Partial<UseFilterPresetsReturn> = {}
): UseFilterPresetsReturn {
  return {
    presets: [],
    userPresets: [],
    sharedPresets: [],
    savePreset: vi.fn() as unknown as UseFilterPresetsReturn["savePreset"],
    loadPreset: vi.fn(),
    deletePreset: vi.fn(),
    toggleShare: vi.fn(),
    updatePreset: vi.fn(),
    loading: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────

describe("FilterPresetManager - dialog rendering", () => {
  it("renders when open is true", () => {
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("filter-preset-manager")).toBeInTheDocument();
    expect(screen.getByText("Filter Presets")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <FilterPresetManager
        open={false}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.queryByTestId("filter-preset-manager")).not.toBeInTheDocument();
  });

  it("shows the save section", () => {
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-save-section")).toBeInTheDocument();
    expect(screen.getByTestId("preset-save-name")).toBeInTheDocument();
    expect(screen.getByTestId("preset-save-description")).toBeInTheDocument();
    expect(screen.getByTestId("preset-save-button")).toBeInTheDocument();
  });

  it("shows empty state when no presets exist", () => {
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-empty-state")).toBeInTheDocument();
  });

  it("shows user presets section", () => {
    const presets = [makePreset({ id: "p1", name: "My Preset" })];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({ userPresets: presets, presets })}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-user-section")).toBeInTheDocument();
    expect(screen.getByTestId("preset-item-p1")).toBeInTheDocument();
    expect(screen.getByText("My Preset")).toBeInTheDocument();
  });

  it("shows shared presets section", () => {
    const sharedPresets = [
      makePreset({
        id: "sp1",
        name: "Shared Preset",
        userId: "alice",
        shared: true,
      }),
    ];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          sharedPresets,
          presets: sharedPresets,
        })}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-shared-section")).toBeInTheDocument();
    expect(screen.getByTestId("preset-item-sp1")).toBeInTheDocument();
    expect(screen.getByText("Shared Preset")).toBeInTheDocument();
  });

  it("shows the search input when presets exist", () => {
    const presets = [makePreset({ id: "p1" })];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({ userPresets: presets, presets })}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-search-input")).toBeInTheDocument();
  });
});

describe("FilterPresetManager - save preset", () => {
  it("calls savePreset when save button is clicked", () => {
    const savePreset = vi.fn();
    const currentFilters = [
      { name: "Status", expression: "status = 'Active'", active: true },
    ];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={currentFilters}
        presetsApi={makePresetsApi({ savePreset: savePreset as unknown as UseFilterPresetsReturn["savePreset"] })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("preset-save-name"), {
      target: { value: "My Saved Preset" },
    });
    fireEvent.change(screen.getByTestId("preset-save-description"), {
      target: { value: "My description" },
    });
    fireEvent.click(screen.getByTestId("preset-save-button"));

    expect(savePreset).toHaveBeenCalledWith(
      "My Saved Preset",
      currentFilters,
      "My description"
    );
  });

  it("disables save button when name is empty", () => {
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[{ name: "A", expression: "a = 1", active: true }]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    expect(screen.getByTestId("preset-save-button")).toBeDisabled();
  });

  it("disables save button when currentFilters is empty", () => {
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId("preset-save-name"), {
      target: { value: "Test" },
    });
    expect(screen.getByTestId("preset-save-button")).toBeDisabled();
  });

  it("saves on Enter key in the name input", () => {
    const savePreset = vi.fn();
    const currentFilters = [
      { name: "Status", expression: "status = 'Active'", active: true },
    ];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={currentFilters}
        presetsApi={makePresetsApi({ savePreset: savePreset as unknown as UseFilterPresetsReturn["savePreset"] })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("preset-save-name"), {
      target: { value: "Enter Key Preset" },
    });
    fireEvent.keyDown(screen.getByTestId("preset-save-name"), {
      key: "Enter",
    });

    expect(savePreset).toHaveBeenCalledWith(
      "Enter Key Preset",
      currentFilters,
      undefined
    );
  });
});

describe("FilterPresetManager - load preset", () => {
  it("calls onLoadPreset and closes when load button is clicked", () => {
    const onLoadPreset = vi.fn();
    const onOpenChange = vi.fn();
    const presets = [makePreset({ id: "p1", filters: [{ name: "A", expression: "a = 1", active: true }] })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={onOpenChange}
        currentFilters={[]}
        presetsApi={makePresetsApi({ userPresets: presets, presets })}
        onLoadPreset={onLoadPreset}
      />
    );

    fireEvent.click(screen.getByTestId("preset-load-p1"));

    expect(onLoadPreset).toHaveBeenCalledWith([
      { name: "A", expression: "a = 1", active: true },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("FilterPresetManager - delete preset", () => {
  it("calls deletePreset when delete is clicked from dropdown", () => {
    const deletePreset = vi.fn();
    const presets = [makePreset({ id: "p1", name: "To Delete" })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
          deletePreset,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    // Open the dropdown menu
    fireEvent.click(screen.getByTestId("preset-more-p1"));
    // Click the delete option
    const deleteBtn = screen.getByTestId("preset-delete-p1");
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);

    expect(deletePreset).toHaveBeenCalledWith("p1");
  });
});

describe("FilterPresetManager - toggle share", () => {
  it("calls toggleShare when share is clicked from dropdown", () => {
    const toggleShare = vi.fn();
    const presets = [makePreset({ id: "p1", shared: false })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
          toggleShare,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("preset-more-p1"));
    fireEvent.click(screen.getByTestId("preset-share-p1"));

    expect(toggleShare).toHaveBeenCalledWith("p1");
  });

  it("shows correct share button text for shared preset", () => {
    const presets = [makePreset({ id: "p1", shared: true })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("preset-more-p1"));
    expect(screen.getByText("Make private")).toBeInTheDocument();
  });

  it("shows correct share button text for private preset", () => {
    const presets = [makePreset({ id: "p1", shared: false })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("preset-more-p1"));
    expect(screen.getByText("Share with others")).toBeInTheDocument();
  });
});

describe("FilterPresetManager - rename preset", () => {
  it("shows rename input when rename is clicked", () => {
    const presets = [makePreset({ id: "p1", name: "Old Name" })];
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("preset-more-p1"));
    fireEvent.click(screen.getByTestId("preset-rename-p1"));

    expect(screen.getByTestId("preset-rename-input-p1")).toBeInTheDocument();
  });

  it("calls updatePreset when rename is confirmed", () => {
    const updatePreset = vi.fn();
    const presets = [makePreset({ id: "p1", name: "Old Name" })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
          updatePreset,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    // Open rename
    fireEvent.click(screen.getByTestId("preset-more-p1"));
    fireEvent.click(screen.getByTestId("preset-rename-p1"));

    // Change the value
    const input = screen.getByTestId("preset-rename-input-p1");
    fireEvent.change(input, { target: { value: "New Name" } });

    // Confirm
    fireEvent.click(screen.getByTestId("preset-rename-confirm-p1"));

    expect(updatePreset).toHaveBeenCalledWith("p1", { name: "New Name" });
  });

  it("cancels rename when cancel is clicked", () => {
    const updatePreset = vi.fn();
    const presets = [makePreset({ id: "p1", name: "Old Name" })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          userPresets: presets,
          presets,
          updatePreset,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    // Open rename
    fireEvent.click(screen.getByTestId("preset-more-p1"));
    fireEvent.click(screen.getByTestId("preset-rename-p1"));

    // Cancel
    fireEvent.click(screen.getByTestId("preset-rename-cancel-p1"));

    expect(updatePreset).not.toHaveBeenCalled();
    // Name should be back to display mode
    expect(screen.getByText("Old Name")).toBeInTheDocument();
  });
});

describe("FilterPresetManager - search", () => {
  it("filters presets by search query", () => {
    const presets = [
      makePreset({ id: "p1", name: "Active Customers" }),
      makePreset({ id: "p2", name: "Recent Orders" }),
    ];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({ userPresets: presets, presets })}
        onLoadPreset={vi.fn()}
      />
    );

    expect(screen.getByTestId("preset-item-p1")).toBeInTheDocument();
    expect(screen.getByTestId("preset-item-p2")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("preset-search-input"), {
      target: { value: "Active" },
    });

    expect(screen.getByTestId("preset-item-p1")).toBeInTheDocument();
    // p2 should not be visible (filtered out)
    expect(screen.queryByTestId("preset-item-p2")).not.toBeInTheDocument();
  });

  it("shows no-matches state when search yields no results", () => {
    const presets = [makePreset({ id: "p1", name: "Active Customers" })];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({ userPresets: presets, presets })}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("preset-search-input"), {
      target: { value: "zzzznotfound" },
    });

    expect(screen.getByTestId("preset-no-matches")).toBeInTheDocument();
  });
});

describe("FilterPresetManager - shared presets (no actions)", () => {
  it("does not show dropdown menu for shared presets", () => {
    const sharedPresets = [
      makePreset({
        id: "sp1",
        name: "Shared",
        userId: "alice",
        shared: true,
      }),
    ];

    render(
      <FilterPresetManager
        open={true}
        onOpenChange={vi.fn()}
        currentFilters={[]}
        presetsApi={makePresetsApi({
          sharedPresets,
          presets: sharedPresets,
        })}
        onLoadPreset={vi.fn()}
      />
    );

    // Shared presets should only have a load button, not a dropdown
    expect(screen.getByTestId("preset-load-sp1")).toBeInTheDocument();
    expect(screen.queryByTestId("preset-more-sp1")).not.toBeInTheDocument();
  });
});

describe("FilterPresetManager - close button", () => {
  it("calls onOpenChange(false) when close is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <FilterPresetManager
        open={true}
        onOpenChange={onOpenChange}
        currentFilters={[]}
        presetsApi={makePresetsApi()}
        onLoadPreset={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("preset-close-button"));
    // Base UI's DialogClose may pass event details as second arg
    expect(onOpenChange.mock.calls[0][0]).toBe(false);
  });
});