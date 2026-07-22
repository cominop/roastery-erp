// FilterSummary unit tests
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FilterSummary from "../FilterSummary";
import type { FilterItem } from "@/hooks/useFilters";

const makeFilter = (
  overrides: Partial<FilterItem> = {}
): FilterItem => ({
  id: "f1",
  name: "Status Active",
  expression: "status = 'Active'",
  active: true,
  ...overrides,
});

describe("FilterSummary", () => {
  it("renders nothing when filters array is empty", () => {
    const { container } = render(
      <FilterSummary filters={[]} onRemove={vi.fn()} onToggle={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders active filters as chips", () => {
    const filters = [
      makeFilter({ id: "f1", name: "Status Active" }),
      makeFilter({ id: "f2", name: "Date Range" }),
    ];
    render(
      <FilterSummary
        filters={filters}
        onRemove={vi.fn()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByTestId("filter-chip-f1")).toBeInTheDocument();
    expect(screen.getByTestId("filter-chip-f2")).toBeInTheDocument();
    expect(screen.getByText("Status Active")).toBeInTheDocument();
    expect(screen.getByText("Date Range")).toBeInTheDocument();
  });

  it("shows filter names", () => {
    const filters = [makeFilter({ name: "My Filter" })];
    render(
      <FilterSummary
        filters={filters}
        onRemove={vi.fn()}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("My Filter")).toBeInTheDocument();
  });

  it("calls onRemove when X button is clicked", () => {
    const onRemove = vi.fn();
    const filters = [makeFilter({ id: "f1" })];
    render(
      <FilterSummary
        filters={filters}
        onRemove={onRemove}
        onToggle={vi.fn()}
      />
    );
    const removeBtn = screen.getByTestId("filter-chip-remove-f1");
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("f1");
  });

  it("does not call onToggle when X button is clicked (stopPropagation)", () => {
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    const filters = [makeFilter({ id: "f1" })];
    render(
      <FilterSummary
        filters={filters}
        onRemove={onRemove}
        onToggle={onToggle}
      />
    );
    const removeBtn = screen.getByTestId("filter-chip-remove-f1");
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("f1");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("calls onToggle when chip is clicked", () => {
    const onToggle = vi.fn();
    const filters = [makeFilter({ id: "f1" })];
    render(
      <FilterSummary
        filters={filters}
        onRemove={vi.fn()}
        onToggle={onToggle}
      />
    );
    const chip = screen.getByTestId("filter-chip-f1");
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith("f1");
  });
});
