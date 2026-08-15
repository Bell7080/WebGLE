import { SUPPORTED_IMAGE_TYPES } from "@core/format";

export interface LoadedImage {
  image: HTMLImageElement;
  url: string;
  fileName: string;
}

export class UnsupportedImageError extends Error {
  constructor() {
    super("PNG 또는 WebP 이미지만 사용할 수 있습니다.");
  }
}

/** File을 디코드된 이미지로 만든다. 배경 제거는 하지 않는다. (기획서 54) */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) throw new UnsupportedImageError();

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();

  return { image, url, fileName: file.name };
}

/** 캔버스 영역에 드래그 앤 드롭을 연결한다. (기획서 78-5) */
export function attachDropTarget(
  element: HTMLElement,
  onFile: (file: File) => void,
): () => void {
  const setDragging = (on: boolean) => element.classList.toggle("dragover", on);

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  };

  element.addEventListener("dragover", onDragOver);
  element.addEventListener("dragleave", onDragLeave);
  element.addEventListener("drop", onDrop);

  return () => {
    element.removeEventListener("dragover", onDragOver);
    element.removeEventListener("dragleave", onDragLeave);
    element.removeEventListener("drop", onDrop);
  };
}
