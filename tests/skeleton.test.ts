import { describe, expect, it } from "vitest";
import type { PuppetBone } from "../src/core/format";
import { canReparent, getBonesByTag, getChildren, sortByHierarchy } from "../src/core/skeleton";

function bone(id: string, parentId: string | null, tags: string[] = []): PuppetBone {
  return {
    id,
    name: id,
    parentId,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    tags,
    motionStrength: 1,
    deform: "soft",
    color: "#ffffff",
  };
}

describe("스켈레톤 조회", () => {
  const bones = [
    bone("root", null, ["root"]),
    bone("body", "root", ["body", "core"]),
    bone("head1", "body", ["head"]),
    bone("head2", "body", ["head"]),
    bone("tail1", "body", ["tail", "secondary"]),
  ];

  it("태그로 찾는다 - 머리가 여러 개여도 모두 반환한다", () => {
    expect(getBonesByTag(bones, "head").map((b) => b.id)).toEqual(["head1", "head2"]);
  });

  it("없는 태그는 빈 배열이다", () => {
    expect(getBonesByTag(bones, "wing")).toEqual([]);
  });

  it("자식을 찾는다", () => {
    expect(getChildren(bones, "body").map((b) => b.id)).toEqual(["head1", "head2", "tail1"]);
  });
});

describe("계층 정렬", () => {
  it("부모가 항상 자식보다 앞에 온다", () => {
    const shuffled = [bone("c", "b"), bone("a", null), bone("b", "a")];
    expect(sortByHierarchy(shuffled).map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("순환 참조가 있어도 멈추지 않는다", () => {
    const cyclic = [bone("a", "b"), bone("b", "a")];
    expect(sortByHierarchy(cyclic)).toHaveLength(2);
  });
});

describe("부모 변경 검사", () => {
  const bones = [bone("a", null), bone("b", "a"), bone("c", "b")];

  it("자기 자신은 부모가 될 수 없다", () => {
    expect(canReparent(bones, "a", "a")).toBe(false);
  });

  it("자손을 부모로 지정할 수 없다", () => {
    expect(canReparent(bones, "a", "c")).toBe(false);
  });

  it("루트로 만드는 것은 언제나 가능하다", () => {
    expect(canReparent(bones, "c", null)).toBe(true);
  });

  it("형제 관계로 붙이는 것은 가능하다", () => {
    expect(canReparent(bones, "c", "a")).toBe(true);
  });
});
