import { useRef, useState, type DragEvent } from "react";

export function useImageDrop(onFile: (file: File) => void, disabled = false) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  function hasFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  return {
    dragging,
    dropProps: {
      onDragEnter(event: DragEvent<HTMLElement>) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      },
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      },
      onDragLeave(event: DragEvent<HTMLElement>) {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (!disabled && file) onFile(file);
      },
    },
  };
}
