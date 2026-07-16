import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode; fallback?: (err: Error) => ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div className="p-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded m-4">
          <p className="font-semibold">Render Error</p>
          <p className="mt-1 font-mono text-xs break-words">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}