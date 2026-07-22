// useFilterPresets — saved filter presets with CRUD, share, and per-user isolation
// Persists presets in localStorage under a per-user key ("roastery:filter-presets:{userId}").
import { useState, useCallback, useEffect, useMemo } from "react";

// ─── Types ─────────────────────────────────────────────

export interface PresetFilterItem {
  /** Display name for the filter (e.g. "Active Customers") */
  name: string;
  /** SQL expression (e.g. "status = 'Active'") */
  expression: string;
  /** Whether the filter was active when saved */
  active: boolean;
}

export interface SavedFilterPreset {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description: string;
  /** The filter state captured in this preset */
  filters: PresetFilterItem[];
  /** Owner user ID */
  userId: string;
  /** Whether this preset is shared with other users */
  shared: boolean;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
}

export interface UseFilterPresetsOptions {
  /** Current user ID. Defaults to "default". */
  userId?: string;
  /** localStorage key prefix. Undefined → "roastery:filter-presets" */
  storageKey?: string;
}

export interface UseFilterPresetsReturn {
  /** All presets visible to this user (own + shared by others) */
  presets: SavedFilterPreset[];
  /** Presets owned by this user */
  userPresets: SavedFilterPreset[];
  /** Presets shared by other users */
  sharedPresets: SavedFilterPreset[];
  /** Save current filters as a new preset */
  savePreset: (
    name: string,
    filters: PresetFilterItem[],
    description?: string
  ) => SavedFilterPreset;
  /** Load a preset's filters by id */
  loadPreset: (id: string) => PresetFilterItem[] | undefined;
  /** Delete a preset by id (owner only — no-op for non-owner) */
  deletePreset: (id: string) => void;
  /** Toggle a preset's shared status (owner only) */
  toggleShare: (id: string) => void;
  /** Update a preset's name and/or description (owner only) */
  updatePreset: (
    id: string,
    updates: Partial<Pick<SavedFilterPreset, "name" | "description">>
  ) => void;
  /** Loading state during initial read */
  loading: boolean;
}

// ─── Helpers ───────────────────────────────────────────

let presetIdCounter = 0;

function generatePresetId(): string {
  presetIdCounter++;
  return `preset_${Date.now()}_${presetIdCounter}`;
}

const DEFAULT_STORAGE_KEY = "roastery:filter-presets";

function storageKeyForUser(userId: string, prefix?: string): string {
  return `${prefix ?? DEFAULT_STORAGE_KEY}:${userId}`;
}

function readPresetsFromStorage(
  userId: string,
  prefix?: string
): SavedFilterPreset[] {
  try {
    const key = storageKeyForUser(userId, prefix);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writePresetsToStorage(
  userId: string,
  presets: SavedFilterPreset[],
  prefix?: string
): void {
  try {
    const key = storageKeyForUser(userId, prefix);
    localStorage.setItem(key, JSON.stringify(presets));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

/** Collect all presets visible to a user: their own + presets shared by others */
function collectVisiblePresets(
  userId: string,
  prefix?: string
): SavedFilterPreset[] {
  const own = readPresetsFromStorage(userId, prefix);

  // Gather presets shared by other users by scanning all known storage keys
  const shared: SavedFilterPreset[] = [];
  try {
    const searchPrefix = prefix ?? DEFAULT_STORAGE_KEY;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${searchPrefix}:`)) continue;
      const otherUserId = key.slice(`${searchPrefix}:`.length);
      if (otherUserId === userId) continue; // skip own
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;
        for (const p of parsed) {
          if (p.shared === true) {
            shared.push(p);
          }
        }
      } catch {
        // skip unparseable keys
      }
    }
  } catch {
    // localStorage not available
  }

  return [...own, ...shared];
}

// ─── Hook ──────────────────────────────────────────────

/**
 * Hook that manages saved filter presets.
 *
 * Presets are stored per-user in localStorage, with an optional "shared" flag
 * that makes them visible to other users. The hook collects the current user's
 * own presets plus any presets shared by other users.
 *
 * @param options.userId - Current user ID (default: "default")
 * @param options.storageKey - localStorage key prefix (default: "roastery:filter-presets")
 */
export function useFilterPresets(
  options?: UseFilterPresetsOptions
): UseFilterPresetsReturn {
  const userId = options?.userId ?? "default";
  const prefix = options?.storageKey;

  const [allPresets, setAllPresets] = useState<SavedFilterPreset[]>(() =>
    collectVisiblePresets(userId, prefix)
  );
  const [loading, setLoading] = useState(false);
  const [, setTick] = useState(0);

  // Refresh when userId changes
  useEffect(() => {
    setLoading(true);
    setAllPresets(collectVisiblePresets(userId, prefix));
    setLoading(false);
  }, [userId, prefix]);

  // Force re-read from storage
  const refresh = useCallback(() => {
    setAllPresets(collectVisiblePresets(userId, prefix));
    setTick((t) => t + 1);
  }, [userId, prefix]);

  const savePreset = useCallback(
    (
      name: string,
      filters: PresetFilterItem[],
      description?: string
    ): SavedFilterPreset => {
      const now = new Date().toISOString();
      const preset: SavedFilterPreset = {
        id: generatePresetId(),
        name,
        description: description ?? "",
        filters,
        userId,
        shared: false,
        createdAt: now,
        updatedAt: now,
      };
      const existing = readPresetsFromStorage(userId, prefix);
      writePresetsToStorage(userId, [...existing, preset], prefix);
      refresh();
      return preset;
    },
    [userId, prefix, refresh]
  );

  const loadPreset = useCallback(
    (id: string): PresetFilterItem[] | undefined => {
      const preset = allPresets.find((p) => p.id === id);
      return preset?.filters;
    },
    [allPresets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      const existing = readPresetsFromStorage(userId, prefix);
      const preset = existing.find((p) => p.id === id);
      // Only the owner can delete
      if (!preset || preset.userId !== userId) return;
      const filtered = existing.filter((p) => p.id !== id);
      writePresetsToStorage(userId, filtered, prefix);
      refresh();
    },
    [userId, prefix, refresh]
  );

  const toggleShare = useCallback(
    (id: string) => {
      const existing = readPresetsFromStorage(userId, prefix);
      const updated = existing.map((p) => {
        if (p.id !== id || p.userId !== userId) return p;
        return { ...p, shared: !p.shared, updatedAt: new Date().toISOString() };
      });
      writePresetsToStorage(userId, updated, prefix);
      refresh();
    },
    [userId, prefix, refresh]
  );

  const updatePreset = useCallback(
    (
      id: string,
      updates: Partial<Pick<SavedFilterPreset, "name" | "description">>
    ) => {
      const existing = readPresetsFromStorage(userId, prefix);
      const updated = existing.map((p) => {
        if (p.id !== id || p.userId !== userId) return p;
        return {
          ...p,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      });
      writePresetsToStorage(userId, updated, prefix);
      refresh();
    },
    [userId, prefix, refresh]
  );

  const userPresets = useMemo(
    () => allPresets.filter((p) => p.userId === userId),
    [allPresets, userId]
  );

  const sharedPresets = useMemo(
    () => allPresets.filter((p) => p.userId !== userId),
    [allPresets, userId]
  );

  return {
    presets: allPresets,
    userPresets,
    sharedPresets,
    savePreset,
    loadPreset,
    deletePreset,
    toggleShare,
    updatePreset,
    loading,
  };
}