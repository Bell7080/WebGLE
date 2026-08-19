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

/** PNG를 WebP로 바꾼 결과. 원본보다 작을 때만 실제 Blob을 돌려준다. */
export interface WebPConversion {
  originalBytes: number;
  convertedBytes: number;
  blob: Blob | null;
  /** 적용하지 않은 이유. 성공해서 Blob이 있으면 null이다. */
  rejectedBecause: "not-smaller" | "pixels-changed" | null;
}

/** 동일하거나 큰 결과를 적용하지 않도록 크기 비교 정책을 한곳에 둔다. */
export function isWebPSmaller(originalBytes: number, convertedBytes: number): boolean {
  return convertedBytes < originalBytes;
}

/** 두 RGBA 버퍼가 완전히 같은지 확인해 변환 과정의 화질 손실을 차단한다. */
export function pixelsAreIdentical(original: Uint8ClampedArray, converted: Uint8ClampedArray): boolean {
  if (original.length !== converted.length) return false;
  for (let index = 0; index < original.length; index += 1) {
    if (original[index] !== converted[index]) return false;
  }
  return true;
}

/** Canvas 인코더를 사용하되, WebP가 더 작지 않으면 원본을 보존한다. */
export async function convertPngToSmallerWebP(
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

  const originalPixels = context.getImageData(0, 0, width, height).data;
  // 최고 품질로 인코딩한 뒤 픽셀을 재검사한다. 브라우저가 손실 압축하면 적용하지 않는다.
  const converted = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 1),
  );
  if (!converted || converted.type !== "image/webp") {
    throw new Error("이 브라우저는 WebP 변환을 지원하지 않습니다.");
  }

  // 저장될 WebP를 다시 디코드해 원본 PNG의 모든 RGBA 채널과 1바이트 단위로 비교한다.
  const convertedBitmap = await createImageBitmap(converted);
  const verificationCanvas = document.createElement("canvas");
  verificationCanvas.width = width;
  verificationCanvas.height = height;
  const verificationContext = verificationCanvas.getContext("2d");
  if (!verificationContext) throw new Error("WebP 화질을 확인할 수 없습니다.");
  verificationContext.drawImage(convertedBitmap, 0, 0);
  convertedBitmap.close();
  const convertedPixels = verificationContext.getImageData(0, 0, width, height).data;
  const identical = pixelsAreIdentical(originalPixels, convertedPixels);
  const smaller = isWebPSmaller(original.size, converted.size);

  return {
    originalBytes: original.size,
    convertedBytes: converted.size,
    // 화질이 완전히 같고 용량까지 줄어든 경우에만 원본 PNG를 교체한다.
    blob: identical && smaller ? converted : null,
    rejectedBecause: !identical ? "pixels-changed" : !smaller ? "not-smaller" : null,
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
