import { hslToHex } from "@core/format";

const SIZE = 132;
const RING = 8;

/**
 * 원형 색 팔레트. 각도가 색상, 중심에서의 거리가 채도다.
 * 편집기에서 색을 쓰는 곳은 관절 구분뿐이므로, 흑백 UI 안에서 여기만 색을 낸다.
 */
export function createColorWheel(current: string, onPick: (color: string) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "color-wheel";

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;

  const context = canvas.getContext("2d");
  if (context) drawWheel(context);

  const pickAt = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * SIZE - SIZE / 2;
    const y = ((event.clientY - bounds.top) / bounds.height) * SIZE - SIZE / 2;

    const radius = SIZE / 2 - RING / 2;
    const distance = Math.hypot(x, y);
    if (distance > radius) return;

    const hue = (Math.atan2(y, x) * 180) / Math.PI;
    const saturation = Math.min(1, distance / radius);
    onPick(hslToHex(hue, 0.2 + saturation * 0.7, 0.68 - saturation * 0.08));
  };

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pickAt(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.buttons === 1) pickAt(event);
  });

  const preview = document.createElement("div");
  preview.className = "color-current";
  preview.style.background = current;

  wrapper.append(canvas, preview);
  return wrapper;
}

function drawWheel(context: CanvasRenderingContext2D): void {
  const center = SIZE / 2;
  const radius = center - RING / 2;
  const image = context.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);
      const index = (y * SIZE + x) * 4;

      if (distance > radius) {
        image.data[index + 3] = 0;
        continue;
      }

      const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
      const saturation = distance / radius;
      const [r, g, b] = hexToRgb(hslToHex(hue, 0.2 + saturation * 0.7, 0.68 - saturation * 0.08));

      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      // 가장자리 한 픽셀은 부드럽게 잘라 계단이 보이지 않게 한다.
      image.data[index + 3] = distance > radius - 1 ? 255 * (radius - distance) : 255;
    }
  }

  context.putImageData(image, 0, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
