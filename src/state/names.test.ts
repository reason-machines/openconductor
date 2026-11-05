import { describe, expect, it } from "vitest";
import { basename, repoNameFromGithub, workspaceName } from "./names";

describe("repoNameFromGithub", () => {
  it.each([
    ["owner/name", { owner: "owner", name: "name" }],
    ["https://github.com/owner/name.git", { owner: "owner", name: "name" }],
    ["git@github.com:owner/name.git", { owner: "owner", name: "name" }],
    ["github.com/owner/name/", { owner: "owner", name: "name" }],
  ])("parses %s", (input, expected) => {
    expect(repoNameFromGithub(input)).toEqual(expected);
  });

  it("rejects input that is not a repository", () => {
    expect(repoNameFromGithub("not a repo")).toBeNull();
  });
});

describe("workspaceName", () => {
  it("never returns a taken name", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const name = workspaceName(taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/Users/me/code/app/")).toBe("app");
    expect(basename("C:\\code\\app")).toBe("app");
  });
});
