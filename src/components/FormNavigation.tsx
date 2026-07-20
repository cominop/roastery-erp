// FormNavigation — sticky footer with record controls
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Plus,
  Save,
} from "lucide-react";

interface FormNavigationProps {
  recordSource: {
    total: number;
    page: number;
    isDirty: boolean;
    loading: boolean;
    gotoRecord: (target: "first" | "last" | "next" | "previous" | "new") => void;
    saveRecord: () => void;
    handleSearch: (term: string) => void;
    searchTerm: string;
  };
  filter?: string;
  allowNew?: boolean;
  allowSave?: boolean;
}

export default function FormNavigation({
  recordSource,
  filter,
  allowNew = true,
  allowSave = true,
}: FormNavigationProps) {
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalPages = Math.max(1, Math.ceil(recordSource.total / 1));

  const handleSearchInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        recordSource.handleSearch(value);
      }, 300);
    },
    [recordSource]
  );

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-t bg-muted/30 text-xs shrink-0 form-navigation">
      {/* Record position */}
      <div className="flex items-center gap-1">
        <button
          className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          onClick={() => recordSource.gotoRecord("first")}
          disabled={recordSource.total === 0}
          title="First record"
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          onClick={() => recordSource.gotoRecord("previous")}
          disabled={recordSource.total === 0 || recordSource.page <= 1}
          title="Previous record"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="tabular-nums whitespace-nowrap px-1 text-muted-foreground">
          {recordSource.total > 0
            ? `Record ${recordSource.page} of ${totalPages}`
            : "No records"}
        </span>
        <button
          className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          onClick={() => recordSource.gotoRecord("next")}
          disabled={recordSource.total === 0 || recordSource.page >= totalPages}
          title="Next record"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          className="px-1 py-0.5 rounded hover:bg-muted disabled:opacity-30"
          onClick={() => recordSource.gotoRecord("last")}
          disabled={recordSource.total === 0}
          title="Last record"
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
      </div>

      {/* Filter indicator */}
      <div className="flex items-center gap-1 ml-2">
        {filter ? (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] border border-muted-foreground/20 text-muted-foreground">
            <Filter className="h-2.5 w-2.5" />
            Filtered
          </span>
        ) : recordSource.searchTerm ? (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] border border-blue-200 text-blue-600 bg-blue-50">
            <Filter className="h-2.5 w-2.5" />
            Search
          </span>
        ) : (
          <span className="text-muted-foreground italic text-[10px]">Unfiltered</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search box */}
      <div className="flex items-center gap-1">
        <Input
          placeholder="Search..."
          className="h-5 w-28 text-[10px] px-1.5 py-0"
          defaultValue={recordSource.searchTerm}
          onChange={handleSearchInput}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 ml-1">
        {allowNew && (
          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px] flex items-center gap-0.5"
            onClick={() => recordSource.gotoRecord("new")}
            title="New record"
          >
            <Plus className="h-2.5 w-2.5" />
            New
          </button>
        )}
        {allowSave && (
          <button
            className="px-1.5 py-0.5 rounded hover:bg-muted disabled:opacity-30 text-[10px] flex items-center gap-0.5"
            onClick={recordSource.saveRecord}
            disabled={!recordSource.isDirty}
            title="Save changes"
          >
            <Save className="h-2.5 w-2.5" />
            Save
          </button>
        )}
        {recordSource.isDirty && (
          <span className="text-amber-500 text-[10px]" title="Unsaved changes">
            ●
          </span>
        )}
      </div>
    </div>
  );
}