// BackupList unit tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BackupList from "../components/BackupList";
import type { BackupRecord } from "../components/BackupList";

// ─── Mock data ──────────────────────────────────────────

const mockBackups: BackupRecord[] = [
  {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    path: "/home/deploy/auto-backup-2026-07-30-143000-before-import.zip",
    created_at: "2026-07-30T14:30:00.000Z",
    reason: "pre_import",
    size_bytes: 245760,
    checksum: "sha256:abc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890",
  },
  {
    id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    path: "/home/deploy/auto-backup-2026-07-29-090000-manual.zip",
    created_at: "2026-07-29T09:00:00.000Z",
    reason: "manual",
    size_bytes: 102400,
    checksum: "sha256:def456abc7890123def456abc7890123def456abc7890123def456abc7890123",
  },
  {
    id: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    path: "/home/deploy/auto-backup-2026-07-28-120000-scheduled.zip",
    created_at: "2026-07-28T12:00:00.000Z",
    reason: "scheduled",
    size_bytes: 51200,
    checksum: null,
  },
];

// ─── Helper to create fetch mock ────────────────────────

function mockFetchSuccess(backups: BackupRecord[]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(backups),
  });
}

function mockFetchError(message: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: message }),
  });
}

function mockFetchNetworkError() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
}

// Mock the rollback endpoint
function mockRollbackSuccess() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, message: "Rollback completed" }),
  });
}

function mockRollbackError(message: string) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: message }),
  });
}

// ─── Tests ──────────────────────────────────────────────

describe("BackupList", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<BackupList />);

    expect(screen.getByText("Loading backups...")).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    mockFetchError("Database connection failed");

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load backups")).toBeInTheDocument();
    });

    expect(screen.getByText("Database connection failed")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders error state on network failure", async () => {
    mockFetchNetworkError();

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load backups")).toBeInTheDocument();
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders empty state when no backups exist", async () => {
    mockFetchSuccess([]);

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("No backups yet")).toBeInTheDocument();
    });
  });

  it("renders backup list with correct data", async () => {
    mockFetchSuccess(mockBackups);

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Metadata Backups")).toBeInTheDocument();
    });

    // Should show the count
    expect(screen.getByText("3 backups available")).toBeInTheDocument();

    // Each backup should have a Rollback button
    const rollbackButtons = screen.getAllByText("Rollback");
    expect(rollbackButtons.length).toBe(3);
  });

  it("shows confirmation dialog when Rollback is clicked", async () => {
    mockFetchSuccess(mockBackups);

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Metadata Backups")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const rollbackBtns = screen.getAllByText("Rollback");
    await user.click(rollbackBtns[0]);

    // Confirmation dialog should appear
    expect(screen.getByText("Rollback to Backup?")).toBeInTheDocument();
    expect(screen.getByText(/replace ALL current metadata/)).toBeInTheDocument();
  });

  it("closes confirmation dialog when Cancel is clicked", async () => {
    mockFetchSuccess(mockBackups);

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Metadata Backups")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const rollbackBtns = screen.getAllByText("Rollback");
    await user.click(rollbackBtns[0]);

    // Dialog should be visible
    expect(screen.getByText("Rollback to Backup?")).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByText("Cancel");
    await user.click(cancelBtn);

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText("Rollback to Backup?")).not.toBeInTheDocument();
    });
  });

  it("performs rollback and shows success state", async () => {
    // First fetch returns backups, second (on rollback) returns success
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBackups),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, message: "Rollback completed" }),
      })
      // After rollback, refetch backups
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBackups),
      });

    globalThis.fetch = fetchMock;

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Metadata Backups")).toBeInTheDocument();
    });

    const user = userEvent.setup();

    // Click the first "Rollback" button in the table row
    const rollbackBtns = screen.getAllByText("Rollback");
    await user.click(rollbackBtns[0]);

    // Confirm dialog should appear — find the "Rollback" button inside the dialog
    // (there are now 3 "Rollback" texts: 2 in table rows, 1 in the dialog)
    await waitFor(() => {
      expect(screen.getByText("Rollback to Backup?")).toBeInTheDocument();
    });

    // The dialog's confirm button is the last "Rollback" button
    const allRollbackBtns = screen.getAllByText("Rollback");
    await user.click(allRollbackBtns[allRollbackBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Rollback Successful")).toBeInTheDocument();
    });
  });

  it("handles rollback failure gracefully", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBackups),
      })
      .mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Backup file not found on disk" }),
      });

    globalThis.fetch = fetchMock;

    render(<BackupList />);

    await waitFor(() => {
      expect(screen.getByText("Metadata Backups")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const rollbackBtns = screen.getAllByText("Rollback");
    await user.click(rollbackBtns[0]);

    // Find the confirm Rollback button in the dialog
    const dialogBtns = screen.getAllByText("Rollback");
    await user.click(dialogBtns[dialogBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Rollback Failed")).toBeInTheDocument();
    });

    expect(screen.getByText("Backup file not found on disk")).toBeInTheDocument();
  });
});