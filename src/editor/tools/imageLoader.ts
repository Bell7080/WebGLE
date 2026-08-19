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
  /** 브라우저 인코더에 전달되어 선택된 품질. 미적용이면 null이다. */
  quality: number | null;
}

/** 일러스트의 선과 투명 경계를 지키면서 비교할 WebP 품질 후보다. */
const WEBP_QUALITY_CANDIDATES = [0.92, 0.88, 0.84] as const;
const MIN_WEBP_PSNR = 38;

/** 동일하거나 큰 결과를 적용하지 않도록 크기 비교 정책을 한곳에 둔다. */
export function isWebPSmaller(originalBytes: number, convertedBytes: number): boolean {
  return convertedBytes < originalBytes;
}

/** 완전 투명 픽셀의 숨은 RGB는 제외하고, 보이는 RGB의 PSNR과 알파 보존 여부를 계산한다. */
export function measureWebPQuality(
  original: Uint8ClampedArray,
  converted: Uint8ClampedArray,
): { psnr: number; alphaIdentical: boolean } {
  if (original.length !== converted.length || original.length % 4 !== 0) {
    return { psnr: 0, alphaIdentical: false };
  }

  let squaredError = 0;
  let comparedChannels = 0;
  let alphaIdentical = true;
  for (let index = 0; index < original.length; index += 4) {
    // 알파는 캐릭터 실루엣과 메시 클리핑에 직접 쓰이므로 색상과 달리 한 단계 차이도 허용하지 않는다.
    if (original[index + 3] !== converted[index + 3]) alphaIdentical = false;
    if (original[index + 3] === 0 && converted[index + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = original[index + channel] - converted[index + channel];
      squaredError += difference * difference;
      comparedChannels += 1;
    }
  }

  if (squaredError === 0 || comparedChannels === 0) return { psnr: Number.POSITIVE_INFINITY, alphaIdentical };
  const meanSquaredError = squaredError / comparedChannels;
  return { psnr: 10 * Math.log10((255 * 255) / meanSquaredError), alphaIdentical };
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
  let best: { blob: Blob; quality: number } | null = null;
  let producedWebP = false;
  let passedVisualQuality = false;
  for (const quality of WEBP_QUALITY_CANDIDATES) {
    // 후보마다 실제로 다시 디코드해 Canvas/WebGL에서 보이는 픽셀을 기준으로 판정한다.
    const converted = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!converted || converted.type !== "image/webp") continue;
    producedWebP = true;
    const convertedBitmap = await createImageBitmap(converted);
    const verificationCanvas = document.createElement("canvas");
    verificationCanvas.width = width;
    verificationCanvas.height = height;
    const verificationContext = verificationCanvas.getContext("2d");
    if (!verificationContext) throw new Error("WebP 화질을 확인할 수 없습니다.");
    verificationContext.drawImage(convertedBitmap, 0, 0);
    convertedBitmap.close();
    const qualityResult = measureWebPQuality(
      originalPixels,
      verificationContext.getImageData(0, 0, width, height).data,
    );
    if (qualityResult.alphaIdentical && qualityResult.psnr >= MIN_WEBP_PSNR) passedVisualQuality = true;
    if (qualityResult.alphaIdentical && qualityResult.psnr >= MIN_WEBP_PSNR && isWebPSmaller(original.size, converted.size)) {
      // 통과한 후보 중 가장 작은 파일을 골라 일러스트별로 압축 효과를 자동 최적화한다.
      if (!best || converted.size < best.blob.size) best = { blob: converted, quality };
    }
  }
  if (!producedWebP) throw new Error("이 브라우저는 WebP 변환을 지원하지 않습니다.");

  return {
    originalBytes: original.size,
    convertedBytes: best?.blob.size ?? original.size,
    blob: best?.blob ?? null,
    // 모든 후보가 품질 기준을 넘지 못한 경우와 용량 이득이 없는 경우를 구분한다.
    rejectedBecause: best ? null : passedVisualQuality ? "not-smaller" : "pixels-changed",
    quality: best?.quality ?? null,
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
