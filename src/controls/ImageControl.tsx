// ImageControl — Access image display
import type { Control } from "@/types";

interface Props {
  ctrl: Control;
}

export default function ImageControl({ ctrl }: Props) {
  const src = (ctrl as Record<string, unknown>).picture as string | undefined;
  const altText = ((ctrl as Record<string, unknown>).text as string) || "Image";

  if (src) {
    return (
      <img
        className="w-full h-full object-contain"
        src={src}
        alt={altText}
      />
    );
  }
  return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground border border-dashed">
      No Image
    </div>
  );
}