// QuickFilterBar unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuickFilterBar from "../QuickFilterBar";
import type { QuickFilterPreset } from "../QuickFilterBar";
import type { FilterItem } from "@/hooks/useFilters";

// ─── Helpers ──────────────────────────────────────────

const makeFilter = (
  overrides: Partial<FilterItem> = {}
): FilterItem => ({
  id: "f1",
  name: "some-filter",
  expression: "x = 1",
  active: true,
  ...overrides,
});

const makePreset = (
  overrides: Partial<QuickFilterPreset> = {}
): QuickFilterPreset => ({
  id: "test-preset",
  label: "Test Preset",
  expression: "status = 'Active'",
  icon: "check",
  description: "A test preset",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────

describe("QuickFilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when presets array is empty", () => {
    const { container } = render(
      <QuickFilterBar
        presets={[]}
        filters={[]}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders preset buttons", () => {
    const presets = [
      makePreset({ id: "p1", label: "Active" }),
      makePreset({ id: "p2", label: "Recent" }),
    ];
    render(
      <QuickFilterBar
        presets={presets}
        filters={[]}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    expect(screen.getByTestId("quick-filter-p1")).toBeInTheDocument();
    expect(screen.getByTestId("quick-filter-p2")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("calls addFilter when an inactive preset is clicked", () => {
    const addFilter = vi.fn(() => "new_id");
    const presets = [makePreset({ id: "p1", expression: "status = 'Active'" })];
    render(
      <QuickFilterBar
        presets={presets}
        filters={[]}
        addFilter={addFilter}
        removeFilter={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("quick-filter-p1"));
    expect(addFilter).toHaveBeenCalledWith("preset:p1", "status = 'Active'");
  });

  it("calls removeFilter when an active preset is clicked", () => {
    const removeFilter = vi.fn();
    const presets = [makePreset({ id: "p1" })];
    const filters = [
      makeFilter({ id: "f1", name: "preset:p1", expression: "status = 'Active'" }),
    ];
    render(
      <QuickFilterBar
        presets={presets}
        filters={filters}
        addFilter={vi.fn()}
        removeFilter={removeFilter}
      />
    );
    fireEvent.click(screen.getByTestId("quick-filter-p1"));
    expect(removeFilter).toHaveBeenCalledWith("f1");
  });

  it("marks active presets with data-active=true", () => {
    const presets = [makePreset({ id: "p1" })];
    const filters = [
      makeFilter({ name: "preset:p1" }),
    ];
    render(
      <QuickFilterBar
        presets={presets}
        filters={filters}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    const btn = screen.getByTestId("quick-filter-p1");
    expect(btn.getAttribute("data-active")).toBe("true");
  });

  it("marks inactive presets with data-active=false", () => {
    const presets = [makePreset({ id: "p1" })];
    render(
      <QuickFilterBar
        presets={presets}
        filters={[]}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    const btn = screen.getByTestId("quick-filter-p1");
    expect(btn.getAttribute("data-active")).toBe("false");
  });

  it("shows the test quick-filter-bar container", () => {
    const presets = [makePreset({ id: "p1" })];
    render(
      <QuickFilterBar
        presets={presets}
        filters={[]}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    expect(screen.getByTestId("quick-filter-bar")).toBeInTheDocument();
  });

  it("renders without icons when icon is not specified", () => {
    const presets = [makePreset({ id: "p1", icon: undefined })];
    render(
      <QuickFilterBar
        presets={presets}
        filters={[]}
        addFilter={vi.fn()}
        removeFilter={vi.fn()}
      />
    );
    // Should still render the label
    expect(screen.getByText("Test Preset")).toBeInTheDocument();
  });
});