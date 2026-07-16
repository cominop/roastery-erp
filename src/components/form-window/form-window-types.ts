export type FormWindowState = "normal" | "minimized" | "maximized";

export interface FormWindowLayout {
  id: string;
  state: FormWindowState;
  position: { x: number; y: number };
  size: { width: number; height: number };
  normalPosition: { x: number; y: number };
  normalSize: { width: number; height: number };
  zIndex: number;
}

export interface FormWindowProps {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  state?: FormWindowState;
  zIndex?: number;
  className?: string;
  onClose?: (id: string) => void;
  onFocus?: (id: string) => void;
  onStateChange?: (id: string, state: FormWindowState) => void;
  onPositionChange?: (id: string, position: { x: number; y: number }) => void;
  onSizeChange?: (id: string, size: { width: number; height: number }) => void;
}