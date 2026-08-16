/**
 * 게임에 들어가는 Runtime Core. (기획서 40, 43 · Phase 9)
 *
 * 편집기 없이 내보낸 묶음만으로 재생이 되는지 본다.
 * DOM도 Phaser도 없는 환경에서 도는 것이 요점이다.
 */
import { describe, expect, it } from "vitest";
import { Puppet, PuppetLoadError } from "../src/runtime";
import { createZip } from "../src/core/format/zip";
import { createBone, createEmptyProject, serializeProject } from "../src/core/format";
import { createGridMesh, vertexCount } from "../src/core/mesh";
import { applyInfluence, normalizeWeights } from "../src/core/weight";
import { findPreset } from "../src/presets";

/** 몸통 하나에 대기 · 이동을 담은 캐릭터. */
function project() {
  const p = createEmptyProject({ name: "허수아비", width: 200, height: 260 });
  const 몸통 = createBone("몸통", 100, 130, p.bones);
  const 다리 = createBone("다리", 100, 210, p.bones, 몸통.id);
  p.bones.push(몸통, 다리);

  const mesh = createGridMesh(200, 260, "low");
  let map = applyInfluence({}, 몸통.id, mesh, {
    x1: 100, y1: 130, x2: 100, y2: 130, radius: 70, strength: 1, softness: 0.5,
  });
  map = applyInfluence(map, 다리.id, mesh, {
    x1: 100, y1: 210, x2: 100, y2: 210, radius: 50, strength: 1, softness: 0.5,
  });
  p.mesh = { ...mesh, weights: normalizeWeights(map, vertexCount(mesh)) };

  for (const id of ["idle", "walk"]) {
    p.animations[id] = structuredClone(findPreset(id)!.animation);
  }
  return p;
}

function zipOf(p = project(), image = true) {
  const entries = [
    { name: "puppet.json", data: new TextEncoder().encode(serializeProject(p, false)) },
  ];
  if (image) entries.push({ name: p.character.texture, data: new Uint8Array([1, 2, 3]) });
  return createZip(entries);
}

describe("묶음 읽기", () => {
  it("ZIP에서 캐릭터와 이미지를 꺼낸다", async () => {
    const puppet = await Puppet.load(zipOf());
    expect(puppet.name).toBe("허수아비");
    expect(puppet.width).toBe(200);
    expect(puppet.height).toBe(260);
    expect(puppet.animations).toEqual(["idle", "walk"]);
    expect(puppet.texture?.type).toBe("image/png");
    expect(puppet.texture?.data).toHaveLength(3);
  });

  it("파일에 없던 격자가 되살아난다", async () => {
    const puppet = await Puppet.load(zipOf());
    const mesh = puppet.mesh!;
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(puppet.uv).toHaveLength(mesh.vertices.length);
  });

  it("이미지가 없어도 읽힌다", async () => {
    const puppet = await Puppet.load(zipOf(project(), false));
    expect(puppet.texture).toBeNull();
    expect(puppet.animations.length).toBe(2);
  });

  it("JSON을 그대로 넘겨도 읽힌다", async () => {
    const bytes = new TextEncoder().encode(serializeProject(project(), false));
    expect((await Puppet.load(bytes)).name).toBe("허수아비");
  });

  it("PuppetForge 파일이 아니면 알려 준다", async () => {
    const bytes = new TextEncoder().encode('{"format":"spine"}');
    await expect(Puppet.load(bytes)).rejects.toThrow(PuppetLoadError);
  });

  it("묶음에 puppet.json이 없으면 알려 준다", async () => {
    const bad = createZip([{ name: "읽을거리.txt", data: new Uint8Array([1]) }]);
    await expect(Puppet.load(bad)).rejects.toThrow(/puppet.json/);
  });
});

describe("재생", () => {
  it("이름을 부르면 재생된다", async () => {
    const puppet = await Puppet.load(zipOf());
    expect(puppet.play("walk")).toBe(true);
    expect(puppet.playing).toBe("walk");
  });

  it("없는 이름은 오류 없이 넘어간다", async () => {
    // 캐릭터마다 가진 동작이 다르므로 없으면 그냥 안 하는 편이 낫다. (기획서 64)
    const puppet = await Puppet.load(zipOf());
    expect(puppet.play("포효")).toBe(false);
    expect(puppet.playing).toBeNull();
  });

  it("정점이 실제로 움직인다", async () => {
    const puppet = await Puppet.load(zipOf());
    puppet.play("walk");

    const rest = puppet.restVertices;
    let peak = 0;
    for (let i = 0; i < 48; i += 1) {
      const moved = puppet.update(1 / 60);
      if (!moved) continue;
      for (let k = 0; k < moved.length; k += 2) {
        peak = Math.max(peak, Math.hypot(moved[k]! - rest[k]!, moved[k + 1]! - rest[k + 1]!));
      }
    }
    expect(peak).toBeGreaterThan(1);
  });

  it("멈추면 계산하지 않는다", async () => {
    const puppet = await Puppet.load(zipOf());
    puppet.play("walk");
    puppet.update(0.1);
    puppet.stop();
    expect(puppet.update(0.1)).toBeNull();
    expect(puppet.playing).toBeNull();
  });

  it("재생 전에는 계산하지 않는다", async () => {
    expect((await Puppet.load(zipOf())).update(0.1)).toBeNull();
  });

  it("같은 배열을 다시 쓴다", async () => {
    const puppet = await Puppet.load(zipOf());
    puppet.play("walk");
    expect(puppet.update(0.02)).toBe(puppet.update(0.02));
  });

  it("속도를 바꾸면 같은 시간에 더 나아간다", async () => {
    const slow = await Puppet.load(zipOf());
    const fast = await Puppet.load(zipOf());
    slow.play("walk", { speed: 0.5 });
    fast.play("walk", { speed: 2 });

    const move = (p: Puppet) => {
      const v = p.update(0.2)!;
      const rest = p.restVertices;
      let sum = 0;
      for (let k = 0; k < v.length; k += 2) sum += Math.abs(v[k + 1]! - rest[k + 1]!);
      return sum;
    };
    expect(move(fast)).not.toBeCloseTo(move(slow), 3);
  });

  it("강도를 0으로 주면 거의 움직이지 않는다", async () => {
    const puppet = await Puppet.load(zipOf());
    puppet.play("walk", { strength: 0 });

    const rest = puppet.restVertices;
    let peak = 0;
    for (let i = 0; i < 24; i += 1) {
      const moved = puppet.update(1 / 60)!;
      for (let k = 0; k < moved.length; k += 2) {
        peak = Math.max(peak, Math.hypot(moved[k]! - rest[k]!, moved[k + 1]! - rest[k + 1]!));
      }
    }
    expect(peak).toBeLessThan(1);
  });
});

describe("게임 이벤트", () => {
  it("이름으로 등록한 이벤트를 받는다 (기획서 42)", async () => {
    const puppet = await Puppet.load(zipOf());
    const heard: string[] = [];
    puppet.on("step", (event) => heard.push(event));

    puppet.play("walk");
    for (let i = 0; i < 60; i += 1) puppet.update(1 / 60);
    expect(heard.length).toBeGreaterThan(0);
    expect(new Set(heard)).toEqual(new Set(["step"]));
  });

  it('"*"로 등록하면 모두 받는다', async () => {
    const puppet = await Puppet.load(zipOf());
    const heard: string[] = [];
    puppet.on("*", (event) => heard.push(event));

    puppet.play("walk");
    for (let i = 0; i < 60; i += 1) puppet.update(1 / 60);
    expect(heard).toContain("step");
  });

  it("그만 듣겠다고 하면 멈춘다", async () => {
    const puppet = await Puppet.load(zipOf());
    const heard: string[] = [];
    const off = puppet.on("step", (event) => heard.push(event));

    puppet.play("walk");
    for (let i = 0; i < 30; i += 1) puppet.update(1 / 60);
    off();
    const 그만둔뒤 = heard.length;
    for (let i = 0; i < 60; i += 1) puppet.update(1 / 60);
    expect(heard).toHaveLength(그만둔뒤);
  });
});

describe("한 자세만 구하기", () => {
  it("재생하지 않고 특정 시각의 정점을 준다", async () => {
    const puppet = await Puppet.load(zipOf());
    const pose = puppet.poseAt("walk", 0.4);
    expect(pose).toHaveLength(puppet.restVertices.length);
    expect(puppet.playing).toBeNull();
  });

  it("없는 이름이면 null이다", async () => {
    expect((await Puppet.load(zipOf())).poseAt("없음", 0)).toBeNull();
  });
});
