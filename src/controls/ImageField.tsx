// ImageField — renders IMAGE type field with upload/preview/camera capture
import { useRef, useState, useEffect, useCallback } from 'react';
import type { FormFieldProps } from './schema/controlSchema';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ImageField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isReadOnly = readOnly ?? field.readOnly ?? false;
  const selectedImage = value instanceof File ? value : null;

  const editWidth = field.editWidth ?? 250;
  const editHeight = field.editHeight ?? 200;
  const viewWidth = field.viewWidth ?? 100;
  const viewHeight = field.viewHeight ?? 80;
  const captureFromCamera = field.captureFromCamera ?? false;

  // Manage object URL for thumbnail preview
  useEffect(() => {
    if (selectedImage) {
      const url = URL.createObjectURL(selectedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [selectedImage]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onChange(file);
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        onChange(file);
      }
    },
    [onChange],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDownload = useCallback(() => {
    if (!selectedImage) return;
    const url = URL.createObjectURL(selectedImage);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedImage.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedImage]);

  const handleOpen = useCallback(() => {
    if (!selectedImage) return;
    const url = URL.createObjectURL(selectedImage);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [selectedImage]);

  const handleRemove = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const handleCameraClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        setCameraStream(stream);
        // Defer so the video element is mounted
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        }, 0);
      } catch {
        // Permission denied or no camera — silently ignore
      }
    },
    [],
  );

  const handleCaptureSnapshot = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraStream) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `camera-capture-${Date.now()}.png`, {
            type: 'image/png',
          });
          onChange(file);
        }
      },
      'image/png',
    );

    // Stop camera stream
    cameraStream.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
  }, [cameraStream, onChange]);

  const handleCancelCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  return (
    <div className="flex flex-col gap-1">
      {field.caption && (
        <label
          htmlFor={field.id}
          className="text-xs font-medium text-foreground"
        >
          {field.caption}
          {field.required && (
            <span className="text-destructive ml-0.5">*</span>
          )}
        </label>
      )}

      {cameraStream ? (
        // ── Camera live view ──────────────────────────────
        <div className="flex flex-col gap-2 rounded-[var(--app-field-border-radius,6px)] border border-border bg-black p-2">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full rounded"
            style={{ maxHeight: editHeight }}
            data-testid="camera-video"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-1 justify-center">
            <Button
              size="xs"
              variant="outline"
              onClick={handleCaptureSnapshot}
              title="Capture"
            >
              📸 Capture
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={handleCancelCamera}
              title="Cancel camera"
            >
              ❌ Cancel
            </Button>
          </div>
        </div>
      ) : selectedImage ? (
        // ── Image selected state ──────────────────────────
        <div className="flex items-center gap-3 rounded-[var(--app-field-border-radius,6px)] border border-border bg-background px-3 py-2">
          {/* Thumbnail */}
          <div
            className="flex-shrink-0 overflow-hidden rounded border border-border"
            style={{ width: viewWidth, height: viewHeight }}
            data-testid="image-thumbnail"
          >
            <img
              src={previewUrl}
              alt={selectedImage.name}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {selectedImage.name}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="outline"
              onClick={handleDownload}
              tabIndex={tabIndex ?? field.tabIndex}
              title="Download"
            >
              ⬇ Download
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={handleOpen}
              tabIndex={tabIndex ?? field.tabIndex}
              title="View"
            >
              🔍 View
            </Button>
            {!isReadOnly && (
              <Button
                size="xs"
                variant="destructive"
                onClick={handleRemove}
                tabIndex={tabIndex ?? field.tabIndex}
                title="Remove"
              >
                🗑 Remove
              </Button>
            )}
          </div>
        </div>
      ) : (
        // ── No image state ────────────────────────────────
        <div className="flex flex-col gap-1">
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-[var(--app-field-border-radius,6px)] border-2 border-dashed border-border bg-background transition-colors',
              !isReadOnly && dragOver && 'border-primary bg-primary/5',
              !isReadOnly &&
                !dragOver &&
                'cursor-pointer hover:border-muted-foreground',
            )}
            style={{ width: editWidth, height: editHeight }}
            onClick={() => {
              if (!isReadOnly) inputRef.current?.click();
            }}
            onDrop={isReadOnly ? undefined : handleDrop}
            onDragOver={isReadOnly ? undefined : handleDragOver}
            onDragLeave={isReadOnly ? undefined : handleDragLeave}
            data-testid="image-dropzone"
          >
            <input
              ref={inputRef}
              id={field.id}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isReadOnly}
              tabIndex={isReadOnly ? -1 : (tabIndex ?? field.tabIndex)}
            />
            {!isReadOnly ? (
              <>
                <span className="text-xs text-muted-foreground">
                  📷 Click to upload image
                </span>
                {captureFromCamera && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleCameraClick}
                    tabIndex={tabIndex ?? field.tabIndex}
                    title="Capture from camera"
                  >
                    📷 Capture from camera
                  </Button>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No image
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-destructive" role="alert">
          {error}
        </p>
      )}
      {!error && field.help && (
        <p className="text-[10px] text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}