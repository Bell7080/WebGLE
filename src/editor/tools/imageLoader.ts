import { SUPPORTED_IMAGE_TYPES } from "@core/format";

export class UnsupportedImageError extends Error {
  constructor() {
    super("이미지 파일이 아닙니다. PNG · WebP를 권장합니다.");
  }
}

export interface LoadedImage {
  image: HTMLImageElement;
  url: string;
  fileName: string;
  /** 열기는 했지만 알려 줄 것이 있을 때. 없으면 undefined. */
  warning?: string;
}

/**
 * File을 디코드된 이미지로 만든다. 배경 제거는 하지 않는다. (기획서 54)
 *
 * PNG · WebP가 아니어도 막지 않는다. 휴대폰 갤러리는 거의 전부 JPEG인데,
 * 거기서 고른 사진이 "쓸 수 없습니다" 한 줄로 튕겨 나오면 그 사람은 그대로 툴을 닫는다.
 * 투명 배경이 없으면 배경까지 함께 휘는 것뿐이므로, 막는 대신 {@link LoadedImage.warning}으로
 * 알려 주고 열어 준다.
 */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!file.type.startsWith("image/")) throw new UnsupportedImageError();

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new UnsupportedImageError();
  }

  const warning = SUPPORTED_IMAGE_TYPES.includes(file.type)
    ? undefined
    : "투명 배경이 없는 그림입니다. 배경까지 함께 휘니 PNG · WebP를 권장합니다.";

  return { image, url, fileName: file.name, warning };
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
