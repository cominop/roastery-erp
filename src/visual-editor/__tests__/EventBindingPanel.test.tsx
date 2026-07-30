/**
 * Unit tests for EventBindingPanel.
 *
 * Tests: rendering, bound/unbound state, typing handlers, clear handler,
 * scope filtering, disabled state, empty state, edge cases.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventBindingPanel from "../EventBindingPanel";
import type { EventBindingPanelProps } from "../EventBindingPanel";
import type { EventBindings } from "../types";

// ─── Fixtures ─────────────────────────────────────────

const EMPTY_EVENTS: EventBindings = {};

const PARTIAL_EVENTS: EventBindings = {
  onClick: "Form_Click",
  onAfterUpdate: "Form_AfterUpdate",
  onEnter: "OnEnter",
  onGotFocus: "OnGotFocus",
  onKeyDown: "OnKeyDown",
};

const ALL_BOUND_EVENTS: EventBindings = {
  onClick: "Form_Click",
  onDblClick: "Form_DblClick",
  onMouseDown: "Form_MouseDown",
  onMouseUp: "Form_MouseUp",
  onMouseMove: "Form_MouseMove",
  onBeforeUpdate: "Form_BeforeUpdate",
  onAfterUpdate: "Form_AfterUpdate",
  onChange: "OnChange",
  onEnter: "OnEnter",
  onExit: "OnExit",
  onGotFocus: "OnGotFocus",
  onLostFocus: "OnLostFocus",
  onKeyDown: "OnKeyDown",
  onKeyUp: "OnKeyUp",
  onKeyPress: "OnKeyPress",
};

const DEFAULT_PROPS: EventBindingPanelProps = {
  events: EMPTY_EVENTS,
  onChange: vi.fn(),
};

// ─── Helpers ──────────────────────────────────────────

function renderDefault(props?: Partial<EventBindingPanelProps>) {
  return render(<EventBindingPanel {...DEFAULT_PROPS} {...props} />);
}

function getRegion() {
  return screen.getByRole("region", { name: "Event bindings" });
}

function getInput(label: string | RegExp) {
  return screen.getByLabelText(label);
}

// ─── Tests ────────────────────────────────────────────

describe("EventBindingPanel", () => {
  // ── Rendering & structure ──

  it("renders the panel with accessible region", () => {
    renderDefault();
    expect(getRegion()).toBeInTheDocument();
  });

  it("renders 'Event Bindings' header by default (scope='all')", () => {
    renderDefault();
    expect(screen.getByText("Event Bindings")).toBeInTheDocument();
  });

  it("renders 'Form Events' header when scope='form'", () => {
    renderDefault({ scope: "form" });
    expect(screen.getByText("Form Events")).toBeInTheDocument();
  });

  it("renders 'Control Events' header when scope='control'", () => {
    renderDefault({ scope: "control" });
    expect(screen.getByText("Control Events")).toBeInTheDocument();
  });

  it("renders all five event group section dividers", () => {
    renderDefault();
    // Group titles use data-testid for precise targeting
    expect(screen.getByTestId("event-group-Click")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Mouse")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Data")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Focus")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Keyboard")).toBeInTheDocument();
  });

  it("shows bound/total count when events are bound", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    expect(screen.getByText("5/15 bound")).toBeInTheDocument();
  });

  it("does not show bound count when no events are bound", () => {
    renderDefault();
    expect(screen.queryByText(/\d+\/\d+ bound/)).not.toBeInTheDocument();
  });

  // ── Scope filtering ──

  it("shows all 15 events in 'all' scope", () => {
    renderDefault();
    const labels = ["Click", "Dbl Click", "Mouse Down", "Mouse Up", "Mouse Move",
      "Before Update", "After Update", "Change", "Enter", "Exit",
      "Got Focus", "Lost Focus", "Key Down", "Key Up", "Key Press"];
    labels.forEach((label) => {
      expect(getInput(new RegExp(`^${label} handler$`))).toBeInTheDocument();
    });
  });

  it("shows all 15 events in 'form' scope", () => {
    renderDefault({ scope: "form" });
    const labels = ["Click", "Dbl Click", "Mouse Down", "Mouse Up", "Mouse Move",
      "Before Update", "After Update", "Change", "Enter", "Exit",
      "Got Focus", "Lost Focus", "Key Down", "Key Up", "Key Press"];
    labels.forEach((label) => {
      expect(getInput(new RegExp(`^${label} handler$`))).toBeInTheDocument();
    });
  });

  it("shows 13 events in 'control' scope (excludes Before Update, After Update)", () => {
    renderDefault({ scope: "control" });
    const included = ["Click", "Dbl Click", "Mouse Down", "Mouse Up", "Mouse Move",
      "Change", "Enter", "Exit", "Got Focus", "Lost Focus",
      "Key Down", "Key Up", "Key Press"];
    const excluded = ["Before Update", "After Update"];
    included.forEach((label) => {
      expect(getInput(new RegExp(`^${label} handler$`))).toBeInTheDocument();
    });
    excluded.forEach((label) => {
      expect(screen.queryByLabelText(new RegExp(`^${label} handler$`))).not.toBeInTheDocument();
    });
  });

  // ── Bound state ──

  it("displays bound handler names in input fields", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    expect(getInput(/^Click handler$/)).toHaveValue("Form_Click");
    expect(getInput(/^After Update handler$/)).toHaveValue("Form_AfterUpdate");
    expect(getInput(/^Enter handler$/)).toHaveValue("OnEnter");
  });

  it("displays empty input for unbound events", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    expect(getInput(/^Mouse Down handler$/)).toHaveValue("");
    expect(getInput(/^Mouse Up handler$/)).toHaveValue("");
  });

  it("shows bound indicator dots for bound events", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    // Each bound event should have a green indicator dot visible
    const dots = document.querySelectorAll(".bg-emerald-500");
    expect(dots.length).toBeGreaterThanOrEqual(5);
  });

  it("shows no green indicator dots when no events bound", () => {
    renderDefault();
    const dots = document.querySelectorAll(".bg-emerald-500");
    expect(dots.length).toBe(0);
  });

  // ── Empty message ──

  it("shows empty message when no events are bound", () => {
    renderDefault();
    expect(screen.getByText(/No events bound/)).toBeInTheDocument();
  });

  it("does not show empty message when events are bound", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    expect(screen.queryByText(/No events bound/)).not.toBeInTheDocument();
  });

  // ── onChange: typing handler names ──

  it("calls onChange with handler name when typing", async () => {
    const onChange = vi.fn();
    // A simple parent wrapper that updates events — simulates real React controlled input
    function WithState() {
      return (
        <EventBindingPanel
          events={EMPTY_EVENTS}
          onChange={onChange}
        />
      );
    }
    render(<WithState />);
    const input = getInput(/^Click handler$/);

    // Use fireEvent.change to set the full value at once (avoids closure staleness)
    fireEvent.change(input, { target: { value: "MyForm_Click" } });

    expect(onChange).toHaveBeenCalled();
    const result = onChange.mock.calls[0][0] as EventBindings;
    expect(result.onClick).toBe("MyForm_Click");
  });

  it("calls onChange with handler removed when input is cleared (UI clear)", async () => {
    const onChange = vi.fn();
    renderDefault({ events: PARTIAL_EVENTS, onChange });

    // Click the clear button
    const clearBtn = screen.getByRole("button", { name: /^Clear Click$/ });
    await userEvent.click(clearBtn);

    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0] as EventBindings;
    expect(result.onClick).toBeUndefined();
    expect(result.onAfterUpdate).toBe("Form_AfterUpdate");
  });

  it("retains other bindings when clearing one event", async () => {
    const onChange = vi.fn();
    renderDefault({ events: PARTIAL_EVENTS, onChange });

    const clearBtn = screen.getByRole("button", { name: /^Clear Enter$/ });
    await userEvent.click(clearBtn);

    const result = onChange.mock.calls[0][0] as EventBindings;
    // onEnter should be removed
    expect(result.onEnter).toBeUndefined();
    // Other bindings preserved
    expect(result.onClick).toBe("Form_Click");
    expect(result.onAfterUpdate).toBe("Form_AfterUpdate");
  });

  // ── Clear button ──

  it("shows clear button for bound events", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    const clearBtn = screen.getByRole("button", { name: /^Clear Click$/ });
    expect(clearBtn).toBeInTheDocument();
  });

  it("does not show clear button for unbound events", () => {
    renderDefault({ events: PARTIAL_EVENTS });
    expect(screen.queryByRole("button", { name: /^Clear Mouse Down$/ })).not.toBeInTheDocument();
  });

  it("calls onChange without that key when clear button is clicked", async () => {
    const onChange = vi.fn();
    renderDefault({ events: PARTIAL_EVENTS, onChange });
    const clearBtn = screen.getByRole("button", { name: /^Clear Click$/ });
    await userEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledOnce();
    const result = onChange.mock.calls[0][0] as EventBindings;
    expect(result.onClick).toBeUndefined();
    expect(result.onAfterUpdate).toBe("Form_AfterUpdate");
  });

  // ── Disabled state ──

  it("disables all inputs when disabled", () => {
    renderDefault({ disabled: true });
    const inputs = screen.getAllByRole("textbox");
    inputs.forEach((input) => expect(input).toBeDisabled());
  });

  it("hides clear buttons when disabled", () => {
    renderDefault({ events: PARTIAL_EVENTS, disabled: true });
    expect(screen.queryByRole("button", { name: /^Clear/ })).not.toBeInTheDocument();
  });

  it("applies disabled opacity class when disabled", () => {
    renderDefault({ disabled: true });
    const region = getRegion();
    expect(region.className).toContain("opacity-60");
  });

  // ── Edge cases ──

  it("handles empty/undefined events gracefully", () => {
    renderDefault({ events: undefined });
    expect(getRegion()).toBeInTheDocument();
    expect(screen.getByText(/No events bound/)).toBeInTheDocument();
  });

  it("shows 15/15 bound when all events are bound", () => {
    renderDefault({ events: ALL_BOUND_EVENTS });
    expect(screen.getByText("15/15 bound")).toBeInTheDocument();
  });

  it("handles null/empty-string values as unbound", () => {
    const eventsWithEmpty = {
      onClick: "",
      onDblClick: null as unknown as string,
    };
    renderDefault({ events: eventsWithEmpty as unknown as EventBindings });
    expect(getInput(/^Click handler$/)).toHaveValue("");
    expect(screen.getByText(/No events bound/)).toBeInTheDocument();
  });

  // ── All 5 group sections ──

  it("renders all 5 group section titles in scope=all", () => {
    renderDefault();
    expect(screen.getByTestId("event-group-Click")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Mouse")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Data")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Focus")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Keyboard")).toBeInTheDocument();
  });

  it("renders all 5 group section titles in scope=form", () => {
    renderDefault({ scope: "form" });
    expect(screen.getByTestId("event-group-Click")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Mouse")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Data")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Focus")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Keyboard")).toBeInTheDocument();
  });

  it("renders all 5 group section titles in scope=control", () => {
    renderDefault({ scope: "control" });
    expect(screen.getByTestId("event-group-Click")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Mouse")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Data")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Focus")).toBeInTheDocument();
    expect(screen.getByTestId("event-group-Keyboard")).toBeInTheDocument();
  });

  // ── Placeholder text ──

  it("shows placeholder text on empty inputs", () => {
    renderDefault();
    expect(getInput(/^Click handler$/)).toHaveAttribute("placeholder", "OnClick");
    expect(getInput(/^Dbl Click handler$/)).toHaveAttribute("placeholder", "OnDblClick");
  });

  it("shows Form_ placeholder for form-only events", () => {
    renderDefault();
    expect(getInput(/^Before Update handler$/)).toHaveAttribute("placeholder", "Form_BeforeUpdate");
    expect(getInput(/^After Update handler$/)).toHaveAttribute("placeholder", "Form_AfterUpdate");
  });
});
