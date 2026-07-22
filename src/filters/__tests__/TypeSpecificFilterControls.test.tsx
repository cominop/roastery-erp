// Type-specific filter controls — unit tests
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterControlFactory from "../FilterControlFactory";
import TextFilterControl from "../TextFilterControl";
import NumberRangeFilterControl from "../NumberRangeFilterControl";
import DateRangeFilterControl from "../DateRangeFilterControl";
import BooleanFilterControl from "../BooleanFilterControl";
import LookupFilterControl from "../LookupFilterControl";
import FilterPanel from "../FilterPanel";
import type { FilterColumn } from "../types";

// ── Helpers ─────────────────────────────────────────────

const textColumn: FilterColumn = {
  field: "customer_name",
  label: "Customer Name",
  type: "text",
};

const numberColumn: FilterColumn = {
  field: "order_total",
  label: "Order Total",
  type: "number",
};

const dateColumn: FilterColumn = {
  field: "orderdate",
  label: "Order Date",
  type: "date",
};

const booleanColumn: FilterColumn = {
  field: "is_active",
  label: "Active",
  type: "boolean",
};

const lookupColumn: FilterColumn = {
  field: "status",
  label: "Status",
  type: "lookup",
  lookupSource: "orders",
};

// ── FilterControlFactory ────────────────────────────────

describe("FilterControlFactory", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders TextFilterControl for text columns", () => {
    render(
      <FilterControlFactory
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("text-filter-control")).toBeInTheDocument();
  });

  it("renders NumberRangeFilterControl for number columns", () => {
    render(
      <FilterControlFactory
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("number-filter-control")).toBeInTheDocument();
  });

  it("renders DateRangeFilterControl for date columns", () => {
    render(
      <FilterControlFactory
        column={dateColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("date-filter-control")).toBeInTheDocument();
  });

  it("renders BooleanFilterControl for boolean columns", () => {
    render(
      <FilterControlFactory
        column={booleanColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("boolean-filter-control")).toBeInTheDocument();
  });

  it("renders LookupFilterControl for lookup columns", () => {
    render(
      <FilterControlFactory
        column={lookupColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("lookup-filter-control")).toBeInTheDocument();
  });
});

// ── TextFilterControl ───────────────────────────────────

describe("TextFilterControl", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a text input and apply button", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("text-filter-input")).toBeInTheDocument();
    expect(screen.getByTestId("text-filter-apply")).toBeInTheDocument();
  });

  it("is disabled when input is empty", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("text-filter-apply")).toBeDisabled();
  });

  it("calls onApply with ILIKE expression on submit", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    const input = screen.getByTestId("text-filter-input");
    fireEvent.change(input, { target: { value: "John" } });

    fireEvent.click(screen.getByTestId("text-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      'Customer Name contains "John"',
      "customer_name ILIKE '%John%'"
    );
  });

  it("escapes single quotes in the expression", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    const input = screen.getByTestId("text-filter-input");
    fireEvent.change(input, { target: { value: "O'Brien" } });
    fireEvent.click(screen.getByTestId("text-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      'Customer Name contains "O\'Brien"',
      "customer_name ILIKE '%O''Brien%'"
    );
  });

  it("submits on Enter key", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    const input = screen.getByTestId("text-filter-input");
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onApply).toHaveBeenCalled();
  });

  it("cancels on Escape key", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    const input = screen.getByTestId("text-filter-input");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
  });

  it("clears input when X is clicked", () => {
    render(
      <TextFilterControl
        column={textColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    const input = screen.getByTestId("text-filter-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test" } });

    const clearBtn = screen.getByLabelText("Clear");
    fireEvent.click(clearBtn);

    expect(input.value).toBe("");
  });
});

// ── NumberRangeFilterControl ────────────────────────────

describe("NumberRangeFilterControl", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders min and max inputs", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("number-filter-min")).toBeInTheDocument();
    expect(screen.getByTestId("number-filter-max")).toBeInTheDocument();
  });

  it("is disabled when both inputs are empty", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("number-filter-apply")).toBeDisabled();
  });

  it("applies with min only", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("number-filter-min"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByTestId("number-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Order Total ≥ 100",
      "order_total >= 100"
    );
  });

  it("applies with max only", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("number-filter-max"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByTestId("number-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Order Total ≤ 500",
      "order_total <= 500"
    );
  });

  it("applies with both min and max", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("number-filter-min"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByTestId("number-filter-max"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByTestId("number-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Order Total: 100 – 500",
      "order_total >= 100 AND order_total <= 500"
    );
  });

  it("submits on Enter in min field", () => {
    render(
      <NumberRangeFilterControl
        column={numberColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("number-filter-min"), {
      target: { value: "50" },
    });
    fireEvent.keyDown(screen.getByTestId("number-filter-min"), { key: "Enter" });

    expect(onApply).toHaveBeenCalled();
  });
});

// ── DateRangeFilterControl ──────────────────────────────

describe("DateRangeFilterControl", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders from and to date inputs", () => {
    render(
      <DateRangeFilterControl
        column={dateColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("date-filter-from")).toBeInTheDocument();
    expect(screen.getByTestId("date-filter-to")).toBeInTheDocument();
  });

  it("is disabled when both inputs are empty", () => {
    render(
      <DateRangeFilterControl
        column={dateColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("date-filter-apply")).toBeDisabled();
  });

  it("applies with from date only", () => {
    render(
      <DateRangeFilterControl
        column={dateColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("date-filter-from"), {
      target: { value: "2024-01-01" },
    });
    fireEvent.click(screen.getByTestId("date-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Order Date from 2024-01-01",
      "orderdate >= '2024-01-01'"
    );
  });

  it("applies with both from and to dates", () => {
    render(
      <DateRangeFilterControl
        column={dateColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByTestId("date-filter-from"), {
      target: { value: "2024-01-01" },
    });
    fireEvent.change(screen.getByTestId("date-filter-to"), {
      target: { value: "2024-12-31" },
    });
    fireEvent.click(screen.getByTestId("date-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Order Date: 2024-01-01 → 2024-12-31",
      "orderdate >= '2024-01-01' AND orderdate <= '2024-12-31'"
    );
  });
});

// ── BooleanFilterControl ────────────────────────────────

describe("BooleanFilterControl", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a select dropdown and apply button", () => {
    render(
      <BooleanFilterControl
        column={booleanColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("boolean-filter-control")).toBeInTheDocument();
  });

  it("is disabled when no value is selected", () => {
    render(
      <BooleanFilterControl
        column={booleanColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByTestId("boolean-filter-apply")).toBeDisabled();
  });

  it("applies with true value", () => {
    render(
      <BooleanFilterControl
        column={booleanColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    // Simulate selecting "Yes" from the dropdown
    const select = screen.getByTestId("boolean-filter-select");
    fireEvent.click(select);
    fireEvent.click(screen.getByTestId("boolean-option-true"));

    fireEvent.click(screen.getByTestId("boolean-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Active: Yes",
      "is_active = true"
    );
  });

  it("applies with false value", async () => {
    const user = userEvent.setup();
    render(
      <BooleanFilterControl
        column={booleanColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    // Open the dropdown and select "No"
    const select = screen.getByTestId("boolean-filter-select");
    await user.click(select);
    const falseOption = await screen.findByTestId("boolean-option-false");
    await user.click(falseOption);

    // Wait for selection to propagate
    await waitFor(() => {
      expect(screen.getByTestId("boolean-filter-apply")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("boolean-filter-apply"));

    expect(onApply).toHaveBeenCalledWith(
      "Active: No",
      "is_active = false"
    );
  });
});

// ── LookupFilterControl ─────────────────────────────────

describe("LookupFilterControl", () => {
  const onApply = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    render(
      <LookupFilterControl
        column={lookupColumn}
        onApply={onApply}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Loading values...")).toBeInTheDocument();
  });
});

// ── FilterPanel with columns ────────────────────────────

describe("FilterPanel with columns", () => {
  const addFilter = vi.fn(() => "filter_new");
  const removeFilter = vi.fn();
  const toggleFilter = vi.fn();
  const setFilterActive = vi.fn();
  const clearFilters = vi.fn();
  const updateFilter = vi.fn();
  const setFilters = vi.fn();

  const columns: FilterColumn[] = [
    textColumn,
    numberColumn,
    dateColumn,
    booleanColumn,
    { field: "status", label: "Status", type: "lookup" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPanel() {
    return render(
      <div data-testid="filter-panel-wrapper">
        <FilterPanel
          filters={[]}
          activeFilters={[]}
          hasActiveFilters={false}
          addFilter={addFilter}
          removeFilter={removeFilter}
          toggleFilter={toggleFilter}
          setFilterActive={setFilterActive}
          clearFilters={clearFilters}
          updateFilter={updateFilter}
          setFilters={setFilters}
          columns={columns}
        />
      </div>
    );
  }

  it("renders the column picker button when expanded", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    expect(screen.getByTestId("filter-add-column-btn")).toBeInTheDocument();
  });

  it("shows the column picker dropdown when the button is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    expect(screen.getByTestId("filter-column-picker")).toBeInTheDocument();
    // Open the picker dropdown
    await user.click(screen.getByTestId("filter-column-picker"));
    // Options are rendered in a Base UI Portal — use async find
    expect(await screen.findByTestId("filter-column-option-customer_name")).toBeInTheDocument();
    expect(await screen.findByTestId("filter-column-option-order_total")).toBeInTheDocument();
    expect(await screen.findByTestId("filter-column-option-orderdate")).toBeInTheDocument();
    expect(await screen.findByTestId("filter-column-option-is_active")).toBeInTheDocument();
    expect(await screen.findByTestId("filter-column-option-status")).toBeInTheDocument();
  });

  it("renders TextFilterControl when a text column is selected", async () => {
    const user = userEvent.setup();
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    // Open the column picker and select text column
    await user.click(screen.getByTestId("filter-column-picker"));
    const option = await screen.findByTestId("filter-column-option-customer_name");
    await user.click(option);

    expect(await screen.findByTestId("text-filter-control")).toBeInTheDocument();
  });

  it("renders NumberRangeFilterControl when a number column is selected", async () => {
    const user = userEvent.setup();
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    await user.click(screen.getByTestId("filter-column-picker"));
    const option = await screen.findByTestId("filter-column-option-order_total");
    await user.click(option);

    expect(await screen.findByTestId("number-filter-control")).toBeInTheDocument();
  });

  it("renders BooleanFilterControl when a boolean column is selected", async () => {
    const user = userEvent.setup();
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    await user.click(screen.getByTestId("filter-column-picker"));
    const option = await screen.findByTestId("filter-column-option-is_active");
    await user.click(option);

    expect(await screen.findByTestId("boolean-filter-control")).toBeInTheDocument();
  });

  it("applies a text filter through the column picker flow", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    // Select text column
    fireEvent.click(screen.getByTestId("filter-column-picker"));
    const option = await screen.findByTestId("filter-column-option-customer_name");
    fireEvent.click(option);

    // Type a value and apply
    const input = screen.getByTestId("text-filter-input");
    fireEvent.change(input, { target: { value: "Acme" } });
    fireEvent.click(screen.getByTestId("text-filter-apply"));

    expect(addFilter).toHaveBeenCalledWith(
      'Customer Name contains "Acme"',
      "customer_name ILIKE '%Acme%'"
    );
  });

  it("cancels the column picker flow and returns to initial state", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));
    fireEvent.click(screen.getByTestId("filter-add-column-btn"));

    // Select a column then cancel
    fireEvent.click(screen.getByTestId("filter-column-picker"));
    const option = await screen.findByTestId("filter-column-option-customer_name");
    fireEvent.click(option);

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    // Should return to the initial "Choose a column" button
    expect(screen.getByTestId("filter-add-column-btn")).toBeInTheDocument();
  });
});

// ── FilterPanel without columns (legacy mode) ───────────

describe("FilterPanel without columns (legacy mode)", () => {
  const addFilter = vi.fn(() => "filter_new");
  const removeFilter = vi.fn();
  const toggleFilter = vi.fn();
  const setFilterActive = vi.fn();
  const clearFilters = vi.fn();
  const updateFilter = vi.fn();
  const setFilters = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the legacy free-form add filter form when no columns prop", () => {
    render(
      <FilterPanel
        filters={[]}
        activeFilters={[]}
        hasActiveFilters={false}
        addFilter={addFilter}
        removeFilter={removeFilter}
        toggleFilter={toggleFilter}
        setFilterActive={setFilterActive}
        clearFilters={clearFilters}
        updateFilter={updateFilter}
        setFilters={setFilters}
      />
    );
    fireEvent.click(screen.getByTestId("filter-panel-toggle"));

    // Legacy form should be visible
    expect(screen.getByTestId("filter-new-name")).toBeInTheDocument();
    expect(screen.getByTestId("filter-new-expression")).toBeInTheDocument();
    expect(screen.getByTestId("filter-add-button")).toBeInTheDocument();
  });
});