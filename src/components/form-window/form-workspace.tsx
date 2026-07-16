export default function FormWorkspace({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/20">
      {children}
    </div>
  );
}