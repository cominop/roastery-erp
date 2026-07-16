import { useCallback, useEffect, useRef, useState } from "react";
import FormWindowTitleBar from "./form-window-title-bar";
import type { FormWindowProps, FormWindowState } from "./form-window-types";

const DEFAULT_MIN = { width: 320, height: 240 };

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export default function FormWindow({
  id,
  title,
  children,
  defaultPosition = { x: 80, y: 60 },
  defaultSize = { width: 640, height: 440 },
  minSize = DEFAULT_MIN,
  state: externalState,
  zIndex = 10,
  className = "",
  onClose,
  onFocus,
  onStateChange,
  onPositionChange,
  onSizeChange,
}: FormWindowProps) {
  const [internalState, setInternalState] = useState<FormWindowState>("normal");
  const state = externalState ?? internalState;

  const normalRef = useRef({ position: defaultPosition, size: defaultSize });
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState<{ width: number; height: number }>(defaultSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  // Drag refs
  const isDragging = useRef(false);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Resize refs
  const isResizing = useRef(false);
  const resizeHandleName = useRef<ResizeHandle | null>(null);
  const resizeStartMouse = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ width: 0, height: 0 });

  const handleFocus = useCallback(() => {
    onFocus?.(id);
  }, [id, onFocus]);

  const handleMinimize = useCallback(() => {
    normalRef.current = { position: { ...position }, size: { ...size } };
    setInternalState("minimized");
    onStateChange?.(id, "minimized");
  }, [id, position, size, onStateChange]);

  const handleMaximize = useCallback(() => {
    if (state === "maximized") {
      setPosition(normalRef.current.position);
      setSize(normalRef.current.size);
      setInternalState("normal");
      onStateChange?.(id, "normal");
    } else if (state === "minimized") {
      setPosition(normalRef.current.position);
      setSize(normalRef.current.size);
      setInternalState("normal");
      onStateChange?.(id, "normal");
    } else {
      normalRef.current = { position: { ...position }, size: { ...size } };
      setPosition({ x: 0, y: 0 });
      setInternalState("maximized");
      onStateChange?.(id, "maximized");
    }
  }, [id, state, position, size, onStateChange]);

  const handleClose = useCallback(() => {
    onClose?.(id);
  }, [id, onClose]);

  // Drag on title bar
  useEffect(() => {
    const titleBar = titleBarRef.current;
    if (!titleBar || state !== "normal") return;

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging.current = true;
      dragStartMouse.current = { x: e.clientX, y: e.clientY };
      dragStartPos.current = { ...position };
      handleFocus();
      document.body.style.userSelect = "none";
    };

    titleBar.addEventListener("mousedown", handleMouseDown);
    return () => titleBar.removeEventListener("mousedown", handleMouseDown);
  }, [state, position, id, handleFocus]);

  // Global mouse move/up for drag and resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const dx = e.clientX - dragStartMouse.current.x;
        const dy = e.clientY - dragStartMouse.current.y;
        const newPos = {
          x: Math.max(0, dragStartPos.current.x + dx),
          y: Math.max(0, dragStartPos.current.y + dy),
        };
        setPosition(newPos);
      } else if (isResizing.current && resizeHandleName.current) {
        const dx = e.clientX - resizeStartMouse.current.x;
        const dy = e.clientY - resizeStartMouse.current.y;
        const handle = resizeHandleName.current;
        let newX = resizeStartPos.current.x;
        let newY = resizeStartPos.current.y;
        let newW = resizeStartSize.current.width;
        let newH = resizeStartSize.current.height;

        if (handle.includes("e")) newW = Math.max(minSize.width, resizeStartSize.current.width + dx);
        if (handle.includes("s")) newH = Math.max(minSize.height, resizeStartSize.current.height + dy);
        if (handle.includes("w")) {
          const w = Math.max(minSize.width, resizeStartSize.current.width - dx);
          newX = resizeStartPos.current.x + (resizeStartSize.current.width - w);
          newW = w;
        }
        if (handle.includes("n")) {
          const h = Math.max(minSize.height, resizeStartSize.current.height - dy);
          newY = resizeStartPos.current.y + (resizeStartSize.current.height - h);
          newH = h;
        }

        setPosition({ x: newX, y: newY });
        setSize({ width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.userSelect = "";
        onPositionChange?.(id, position);
      } else if (isResizing.current) {
        isResizing.current = false;
        resizeHandleName.current = null;
        document.body.style.userSelect = "";
        onPositionChange?.(id, position);
        onSizeChange?.(id, size);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [id, minSize, onPositionChange, onSizeChange, position, size]);

  const startResize = useCallback((handle: ResizeHandle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    resizeHandleName.current = handle;
    resizeStartMouse.current = { x: e.clientX, y: e.clientY };
    resizeStartPos.current = { ...position };
    resizeStartSize.current = { ...size };
    handleFocus();
    document.body.style.userSelect = "none";
  }, [position, size, handleFocus]);

  const isMinimized = state === "minimized";
  const isMaximized = state === "maximized";

  if (isMinimized) {
    return (
      <div
        role="region"
        aria-label={title}
        className={`absolute overflow-hidden rounded-md border bg-background shadow-md ${className}`}
        style={{ left: position.x, top: position.y, width: 280, height: 40, zIndex }}
        onMouseDown={handleFocus}
      >
        <FormWindowTitleBar
          title={title}
          state={state}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
      </div>
    );
  }

  if (isMaximized) {
    return (
      <div
        role="region"
        aria-label={title}
        className={`absolute overflow-hidden rounded-none border-0 bg-background shadow-lg ${className}`}
        style={{ left: 0, top: 0, width: "100%", height: "100%", zIndex }}
        onMouseDown={handleFocus}
      >
        <div className="flex h-full flex-col">
          <FormWindowTitleBar
            title={title}
            state={state}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            onClose={handleClose}
          />
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    );
  }

  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: "absolute",
    zIndex: 30,
    cursor,
  });

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={title}
      className={`absolute rounded-md border bg-background shadow-lg ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onMouseDown={handleFocus}
    >
      <div className="flex h-full flex-col">
        <div ref={titleBarRef} className="cursor-grab active:cursor-grabbing">
          <FormWindowTitleBar
            title={title}
            state={state}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            onClose={handleClose}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>

      {/* Resize handles */}
      <div onMouseDown={(e) => startResize("n", e)} style={{ ...handleStyle("n-resize"), top: -4, left: 8, right: 8, height: 8 }} />
      <div onMouseDown={(e) => startResize("s", e)} style={{ ...handleStyle("s-resize"), bottom: -4, left: 8, right: 8, height: 8 }} />
      <div onMouseDown={(e) => startResize("e", e)} style={{ ...handleStyle("e-resize"), right: -4, top: 8, bottom: 8, width: 8 }} />
      <div onMouseDown={(e) => startResize("w", e)} style={{ ...handleStyle("w-resize"), left: -4, top: 8, bottom: 8, width: 8 }} />
      <div onMouseDown={(e) => startResize("ne", e)} style={{ ...handleStyle("ne-resize"), top: -4, right: -4, width: 12, height: 12 }} />
      <div onMouseDown={(e) => startResize("nw", e)} style={{ ...handleStyle("nw-resize"), top: -4, left: -4, width: 12, height: 12 }} />
      <div onMouseDown={(e) => startResize("se", e)} style={{ ...handleStyle("se-resize"), bottom: -4, right: -4, width: 12, height: 12 }} />
      <div onMouseDown={(e) => startResize("sw", e)} style={{ ...handleStyle("sw-resize"), bottom: -4, left: -4, width: 12, height: 12 }} />
    </div>
  );
}
