// FilterPanel unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterPanel from "../FilterPanel";
import type { FilterItem } from "@/hooks/useFilters";

// Helper to build the props object the FilterPanel expects
function buildProps(overrides: Partial<ReturnType<typeof defaultProps>> = {}) {
  return { ...defaultProps(), ...overrides };
}

function defaultProps() {
  const addFilter = vi.fn(() => "filter_new");
  const removeFilter = vi.fn();
  const toggleFilter = vi.fn();
  const setFilterActive = vi.fn();
  const clearFilters = vi.fn();
  const updateFilter = vi.fn();
  const setFilters = vi.fn();

  return {
    filters: [] as FilterItem[],
    activeFilters: [] as FilterItem[],
    hasActiveFilters: false,
    addFilter,
    removeFilter,
    toggleFilter,
    setFilterActive,
    clearFilters,
    updateFilter,
    setFilters,
  };
}

const makeFilter = (
  overrides: Partial<FilterItem> = {}
): FilterItem => ({
  id: "f1",
  name: "Status Active",
  expression: "status = 'Active'",
  active: true,
  ...overrides,
});

describe("FilterPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders in collapsed state by default", () => {
    render(<FilterPanel {...buildProps()} />);
    // The toggle button should be visible
    expect(screen.getByTestId("filter-panel-toggle")).toBeInTheDocument();
    // The expanded content should not be visible
    expect(screen.queryByTestId("filter-panel-content")).not.toBeInTheDocument();
  });

  it("shows the Filters heading", () => {
    render(<FilterPanel {...buildProps()} />);
    expect(screen.getByText("Filters")).toBeInTheDocument();
  });

  it("shows filter count badge when filters are active", () => {
    const filters = [makeFilter({ id: "f1" }), makeFilter({ id: "f2" })];
    const activeFilters = filters;
    render(
      <FilterPanel
        {...buildProps({
          filters,
          activeFilters,
          hasActiveFilters: true,
        })}
      />
    );
    const badge = screen.getByTestId("filter-count-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("2");
  });

  it("does not show filter count badge when no filters are active", () => {
    render(<FilterPanel {...buildProps()} />);
    expect(screen.queryByTestId("filter-count-badge")).not.toBeInTheDocument();
  });

  it("expands when the toggle bar is clicked", () => {
    render(<FilterPanel {...buildProps()} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.getByTestId("filter-panel-content")).toBeInTheDocument();
  });

  it("collapses when the toggle bar is clicked again", () => {
    render(<FilterPanel {...buildProps()} />);
    // Expand
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.getByTestId("filter-panel-content")).toBeInTheDocument();
    // Collapse
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.queryByTestId("filter-panel-content")).not.toBeInTheDocument();
  });

  it("shows Add Filter form when expanded", () => {
    render(<FilterPanel {...buildProps()} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.getByTestId("filter-add-form")).toBeInTheDocument();
    expect(screen.getByTestId("filter-new-name")).toBeInTheDocument();
    expect(screen.getByTestId("filter-new-expression")).toBeInTheDocument();
    expect(screen.getByTestId("filter-add-button")).toBeInTheDocument();
  });

  it("calls addFilter when Add Filter button is clicked", () => {
    const addFilter = vi.fn(() => "filter_new");
    render(<FilterPanel {...buildProps({ addFilter })} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const nameInput = screen.getByTestId("filter-new-name");
    const exprInput = screen.getByTestId("filter-new-expression");
    const addBtn = screen.getByTestId("filter-add-button");

    fireEvent.change(nameInput, { target: { value: "My Filter" } });
    fireEvent.change(exprInput, { target: { value: "x = 1" } });
    fireEvent.click(addBtn);

    expect(addFilter).toHaveBeenCalledWith("My Filter", "x = 1");
  });

  it("does not call addFilter when name or expression is empty", () => {
    const addFilter = vi.fn(() => "filter_new");
    render(<FilterPanel {...buildProps({ addFilter })} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const addBtn = screen.getByTestId("filter-add-button");
    // Button should be disabled when inputs are empty
    expect(addBtn).toBeDisabled();

    fireEvent.click(addBtn);
    expect(addFilter).not.toHaveBeenCalled();
  });

  it("clears the form inputs after adding a filter", () => {
    const addFilter = vi.fn(() => "filter_new");
    render(<FilterPanel {...buildProps({ addFilter })} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const nameInput = screen.getByTestId("filter-new-name") as HTMLInputElement;
    const exprInput = screen.getByTestId("filter-new-expression") as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "Test" } });
    fireEvent.change(exprInput, { target: { value: "a = 1" } });
    fireEvent.click(screen.getByTestId("filter-add-button"));

    expect(nameInput.value).toBe("");
    expect(exprInput.value).toBe("");
  });

  it("calls clearFilters when Clear All is clicked", () => {
    const clearFilters = vi.fn();
    const filters = [makeFilter({ id: "f1" })];
    render(
      <FilterPanel
        {...buildProps({
          filters,
          activeFilters: filters,
          hasActiveFilters: true,
          clearFilters,
        })}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    const clearBtn = screen.getByTestId("filter-clear-all");
    fireEvent.click(clearBtn);
    expect(clearFilters).toHaveBeenCalled();
  });

  it("does not show Clear All when no filters exist", () => {
    render(<FilterPanel {...buildProps()} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.queryByTestId("filter-clear-all")).not.toBeInTheDocument();
  });

  it("calls removeFilter when remove X is clicked on a filter", () => {
    const removeFilter = vi.fn();
    const filters = [makeFilter({ id: "f1" })];
    render(
      <FilterPanel
        {...buildProps({
          filters,
          activeFilters: filters,
          hasActiveFilters: true,
          removeFilter,
        })}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const removeBtn = screen.getByTestId("filter-remove-f1");
    fireEvent.click(removeBtn);
    expect(removeFilter).toHaveBeenCalledWith("f1");
  });

  it("calls setFilterActive when toggle switch is clicked", () => {
    const setFilterActive = vi.fn();
    const filters = [makeFilter({ id: "f1", active: true })];
    render(
      <FilterPanel
        {...buildProps({
          filters,
          activeFilters: filters,
          hasActiveFilters: true,
          setFilterActive,
        })}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const toggle = screen.getByTestId("filter-toggle-f1");
    fireEvent.click(toggle);
    expect(setFilterActive).toHaveBeenCalledWith("f1", false);
  });

  it("shows active filter summary chips in collapsed state", () => {
    const filters = [makeFilter({ id: "f1", name: "Status Active" })];
    const activeFilters = filters;
    render(
      <FilterPanel
        {...buildProps({
          filters,
          activeFilters,
          hasActiveFilters: true,
        })}
      />
    );
    // Collapsed state should show summary chips
    expect(screen.getByTestId("filter-chip-f1")).toBeInTheDocument();
    expect(screen.getByText("Status Active")).toBeInTheDocument();
  });

  it("filters the filter list by the search query", () => {
    const filters = [
      makeFilter({ id: "f1", name: "Status Active" }),
      makeFilter({ id: "f2", name: "Date Range" }),
    ];
    render(
      <FilterPanel
        {...buildProps({ filters, activeFilters: [], hasActiveFilters: false })}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    // Both filters should be visible initially
    expect(screen.getByTestId("filter-item-f1")).toBeInTheDocument();
    expect(screen.getByTestId("filter-item-f2")).toBeInTheDocument();

    // Search for "Status"
    const searchInput = screen.getByTestId("filter-search-input");
    fireEvent.change(searchInput, { target: { value: "Status" } });

    expect(screen.getByTestId("filter-item-f1")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-item-f2")).not.toBeInTheDocument();
  });

  it("shows no-matches message when search yields no results", () => {
    const filters = [makeFilter({ id: "f1", name: "Status Active" })];
    render(
      <FilterPanel
        {...buildProps({ filters, activeFilters: [], hasActiveFilters: false })}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const searchInput = screen.getByTestId("filter-search-input");
    fireEvent.change(searchInput, { target: { value: "ZZZNoMatch" } });

    expect(screen.getByTestId("filter-no-matches")).toBeInTheDocument();
  });

  it("adds filter on Enter key in name field", () => {
    const addFilter = vi.fn(() => "filter_new");
    render(<FilterPanel {...buildProps({ addFilter })} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const nameInput = screen.getByTestId("filter-new-name");
    const exprInput = screen.getByTestId("filter-new-expression");

    fireEvent.change(nameInput, { target: { value: "Test" } });
    fireEvent.change(exprInput, { target: { value: "x = 1" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(addFilter).toHaveBeenCalledWith("Test", "x = 1");
  });

  it("adds filter on Enter key in expression field", () => {
    const addFilter = vi.fn(() => "filter_new");
    render(<FilterPanel {...buildProps({ addFilter })} />);
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    const nameInput = screen.getByTestId("filter-new-name");
    const exprInput = screen.getByTestId("filter-new-expression");

    fireEvent.change(nameInput, { target: { value: "Test" } });
    fireEvent.change(exprInput, { target: { value: "x = 1" } });
    fireEvent.keyDown(exprInput, { key: "Enter" });

    expect(addFilter).toHaveBeenCalledWith("Test", "x = 1");
  });
});
