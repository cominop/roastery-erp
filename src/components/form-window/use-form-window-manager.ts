import { useState, useCallback, useRef } from "react";
import type { FormWindowLayout, FormWindowState } from "./form-window-types";

const CASCADE_OFFSET = 24;
const WORKSPACE_MARGIN = 32;
const DEFAULT_SIZE = { width: 640, height: 440 };

let nextZIndex = 10;

export function useFormWindowManager() {
  const [windows, setWindows] = useState<FormWindowLayout[]>([]);
  const cascadeRef = useRef(0);

  // Track cascade offsets across all windows
  const nextCascade = useCallback(() => {
    const offset = cascadeRef.current * CASCADE_OFFSET + WORKSPACE_MARGIN;
    cascadeRef.current += 1;
    return { x: offset, y: offset };
  }, []);

  const openWindow = useCallback(
    (id: string) => {
      const existing = windows.find((w) => w.id === id);
      if (existing) {
        // Bring to front
        bringToFront(id);
        return existing;
      }
      const cascade = nextCascade();
      const newWindow: FormWindowLayout = {
        id,
        state: "normal",
        position: cascade,
        size: { ...DEFAULT_SIZE },
        normalPosition: { ...cascade },
        normalSize: { ...DEFAULT_SIZE },
        zIndex: nextZIndex++,
      };
      setWindows((prev) => [...prev, newWindow]);
      return newWindow;
    },
    [windows, nextCascade]
  );

  const closeWindow = useCallback((id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, zIndex: nextZIndex++ } : w))
    );
  }, []);

  const updateState = useCallback(
    (id: string, state: FormWindowState) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const update: Partial<FormWindowLayout> = { state };
          if (state === "maximized") {
            update.normalPosition = { ...w.position };
            update.normalSize = { ...w.size };
            update.position = { x: 0, y: 0 };
          } else if (state === "normal") {
            update.position = { ...w.normalPosition };
            update.size = { ...w.normalSize };
          }
          return { ...w, ...update };
        })
      );
    },
    []
  );

  const updatePosition = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setWindows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, position } : w))
      );
    },
    []
  );

  const updateSize = useCallback(
    (id: string, size: { width: number; height: number }) => {
      setWindows((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          // Keep the normal size updated when dragging/resizing
          const update: Partial<FormWindowLayout> = { size };
          if (w.state === "normal") {
            update.normalSize = { ...size };
          }
          return { ...w, ...update };
        })
      );
    },
    []
  );

  const getZIndex = useCallback(
    (id: string) => {
      const w = windows.find((w) => w.id === id);
      return w?.zIndex ?? 10;
    },
    [windows]
  );

  return {
    windows,
    openWindow,
    closeWindow,
    bringToFront,
    updateState,
    updatePosition,
    updateSize,
    getZIndex,
  };
}