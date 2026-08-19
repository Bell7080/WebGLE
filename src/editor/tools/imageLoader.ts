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

/** PNG를 WebP로 바꾼 결과. 사용자가 요청한 변환은 성공한 후보가 있으면 항상 적용한다. */
export interface WebPConversion {
  originalBytes: number;
  convertedBytes: number;
  blob: Blob;
  /** 브라우저 인코더에 전달되어 최종 선택된 품질이다. */
  quality: number;
}

/** 화질과 용량 사이에서 브라우저 인코더가 시도할 WebP 품질 후보다. */
const WEBP_QUALITY_CANDIDATES = [0.92, 0.88, 0.84] as const;

/** Canvas 인코더의 후보 중 가장 작은 결과를 골라 명시적인 변환 요청을 확실히 수행한다. */
export async function convertPngToWebP(
  image: CanvasImageSource,
  width: number,
  height: number,
  original: Blob,
): Promise<WebPConversion> {
  // MIME과 확장자를 함께 확인하는 UI와 별개로 변환 함수 자체도 PNG만 허용한다.
  if (original.type !== "image/png") throw new UnsupportedImageError();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 변환을 시작할 수 없습니다.");
  context.drawImage(image, 0, 0, width, height);

  let best: { blob: Blob; quality: number } | null = null;
  for (const quality of WEBP_QUALITY_CANDIDATES) {
    // 사용자가 변환을 명시했으므로 품질 차이를 이유로 거부하지 않고 가장 작은 정상 후보를 고른다.
    const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!converted || converted.type !== "image/webp") continue;
    if (!best || converted.size < best.blob.size) best = { blob: converted, quality };
  }
  if (!best) throw new Error("이 브라우저는 WebP 변환을 지원하지 않습니다.");

  return {
    originalBytes: original.size,
    convertedBytes: best.blob.size,
    blob: best.blob,
    quality: best.quality,
  };
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
