// FilterPresetManager — dialog for saving, loading, managing, and sharing filter presets
// Integrates with useFilterPresets hook and the FilterPanel's filter state.
import { useState, useCallback } from "react";
import {
  Save,
  FolderOpen,
  Trash2,
  Globe,
  Lock,
  Pencil,
  Check,
  X,
  Bookmark,
  Share2,
  Search,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  SavedFilterPreset,
  PresetFilterItem,
  UseFilterPresetsReturn,
} from "./useFilterPresets";

// ─── Types ─────────────────────────────────────────────

interface FilterPresetManagerProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Current filter items (to save as preset) */
  currentFilters: PresetFilterItem[];
  /** Preset management functions from useFilterPresets */
  presetsApi: UseFilterPresetsReturn;
  /** Called when the user chooses to load a preset */
  onLoadPreset: (filters: PresetFilterItem[]) => void;
  /** Current user ID for display */
  userId?: string;
}

// ─── Component ─────────────────────────────────────────

export default function FilterPresetManager({
  open,
  onOpenChange,
  currentFilters,
  presetsApi,
  onLoadPreset,
  userId,
}: FilterPresetManagerProps) {
  const {
    userPresets,
    sharedPresets,
    savePreset,
    deletePreset,
    toggleShare,
    updatePreset,
  } = presetsApi;

  // ── Save form state ──
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  // ── Rename state ──
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState("");

  // ── Handlers ──

  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    savePreset(name, currentFilters, saveDescription.trim() || undefined);
    setSaveName("");
    setSaveDescription("");
  }, [saveName, saveDescription, currentFilters, savePreset]);

  const handleLoad = useCallback(
    (preset: SavedFilterPreset) => {
      onLoadPreset(preset.filters);
      onOpenChange(false);
    },
    [onLoadPreset, onOpenChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      deletePreset(id);
    },
    [deletePreset]
  );

  const handleToggleShare = useCallback(
    (id: string) => {
      toggleShare(id);
    },
    [toggleShare]
  );

  const handleStartRename = useCallback(
    (preset: SavedFilterPreset) => {
      setRenamingId(preset.id);
      setRenameValue(preset.name);
    },
    []
  );

  const handleFinishRename = useCallback(
    (id: string) => {
      const name = renameValue.trim();
      if (name) {
        updatePreset(id, { name });
      }
      setRenamingId(null);
      setRenameValue("");
    },
    [renameValue, updatePreset]
  );

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const handleSaveKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFinishRename(id);
      }
      if (e.key === "Escape") {
        handleCancelRename();
      }
    },
    [handleFinishRename, handleCancelRename]
  );

  // ── Filtering ──

  const filterPresets = useCallback(
    (presets: SavedFilterPreset[]): SavedFilterPreset[] => {
      if (!searchQuery) return presets;
      const q = searchQuery.toLowerCase();
      return presets.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    },
    [searchQuery]
  );

  // ── Render helpers ──

  const renderPresetRow = (
    preset: SavedFilterPreset,
    isOwn: boolean
  ) => {
    const isRenaming = renamingId === preset.id;

    return (
      <div
        key={preset.id}
        data-testid={`preset-item-${preset.id}`}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
      >
        {/* Icon */}
        <Bookmark className="size-4 shrink-0 text-muted-foreground" />

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1">
              <Input
                data-testid={`preset-rename-input-${preset.id}`}
                className="h-7 text-xs"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, preset.id)}
                autoFocus
              />
              <Button
                size="icon-xs"
                variant="ghost"
                data-testid={`preset-rename-confirm-${preset.id}`}
                onClick={() => handleFinishRename(preset.id)}
              >
                <Check className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                data-testid={`preset-rename-cancel-${preset.id}`}
                onClick={handleCancelRename}
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : (
            <>
              <div className="text-xs font-medium text-foreground leading-tight truncate flex items-center gap-1.5">
                {preset.name}
                {preset.shared && (
                  <Globe className="size-3 shrink-0 text-muted-foreground" />
                )}
              </div>
              {preset.description && (
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {preset.description}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                {preset.filters.length} filter{preset.filters.length !== 1 ? "s" : ""}
                {" · "}
                {new Date(preset.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="icon-xs"
            variant="ghost"
            data-testid={`preset-load-${preset.id}`}
            onClick={() => handleLoad(preset)}
            title="Load this preset"
          >
            <FolderOpen className="size-3" />
          </Button>

          {isOwn && !isRenaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  data-testid={`preset-more-${preset.id}`}
                >
                  <svg
                    className="size-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={0}>
                <DropdownMenuItem
                  data-testid={`preset-rename-${preset.id}`}
                  onClick={() => handleStartRename(preset)}
                >
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`preset-share-${preset.id}`}
                  onClick={() => handleToggleShare(preset.id)}
                >
                  {preset.shared ? (
                    <>
                      <Lock className="size-3.5" />
                      Make private
                    </>
                  ) : (
                    <>
                      <Share2 className="size-3.5" />
                      Share with others
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid={`preset-delete-${preset.id}`}
                  variant="destructive"
                  onClick={() => handleDelete(preset.id)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  };

  const filteredUserPresets = filterPresets(userPresets);
  const filteredSharedPresets = filterPresets(sharedPresets);
  const hasAnyPresets = userPresets.length > 0 || sharedPresets.length > 0;
  const hasSearchResults =
    filteredUserPresets.length > 0 || filteredSharedPresets.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="filter-preset-manager"
      >
        <DialogHeader>
          <DialogTitle>Filter Presets</DialogTitle>
          <DialogDescription>
            Save, load, and share filter configurations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Save section ── */}
          <div
            className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2"
            data-testid="preset-save-section"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Save className="size-3" />
              <span>Save Current Filters</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input
                data-testid="preset-save-name"
                className="h-7 text-xs"
                placeholder="Preset name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={handleSaveKeyDown}
              />
              <Textarea
                data-testid="preset-save-description"
                className="h-14 text-xs resize-none"
                placeholder="Optional description..."
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
              />
            </div>
            <Button
              data-testid="preset-save-button"
              size="xs"
              variant="outline"
              onClick={handleSave}
              disabled={!saveName.trim() || currentFilters.length === 0}
              className="w-full"
            >
              <Plus className="size-3" />
              Save Preset ({currentFilters.length} filter
              {currentFilters.length !== 1 ? "s" : ""})
            </Button>
          </div>

          <Separator />

          {/* ── Search ── */}
          {hasAnyPresets && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                data-testid="preset-search-input"
                className="h-7 pl-7 text-xs"
                placeholder="Search presets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}

          {/* ── Your Presets ── */}
          {userPresets.length > 0 && (
            <div data-testid="preset-user-section">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Bookmark className="size-3" />
                <span>
                  My Presets
                  {searchQuery && filteredUserPresets.length < userPresets.length
                    ? ` (${filteredUserPresets.length}/${userPresets.length})`
                    : ` (${userPresets.length})`}
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {filteredUserPresets.map((p) => renderPresetRow(p, true))}
              </div>
            </div>
          )}

          {/* ── Shared Presets ── */}
          {sharedPresets.length > 0 && (
            <div data-testid="preset-shared-section">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Share2 className="size-3" />
                <span>
                  Shared with Me
                  {searchQuery &&
                  filteredSharedPresets.length < sharedPresets.length
                    ? ` (${filteredSharedPresets.length}/${sharedPresets.length})`
                    : ` (${sharedPresets.length})`}
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {filteredSharedPresets.map((p) => renderPresetRow(p, false))}
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {!hasAnyPresets && (
            <p
              className="text-xs text-muted-foreground text-center py-4"
              data-testid="preset-empty-state"
            >
              No saved presets yet. Save your current filter configuration above.
            </p>
          )}

          {hasAnyPresets && !hasSearchResults && searchQuery && (
            <p
              className="text-xs text-muted-foreground text-center py-2"
              data-testid="preset-no-matches"
            >
              No presets match your search.
            </p>
          )}
        </div>

        <DialogFooter showCloseButton>
          <DialogClose asChild>
            <Button variant="outline" data-testid="preset-close-button">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}