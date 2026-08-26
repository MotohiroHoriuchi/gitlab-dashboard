import { describe, expect, it } from "vitest";
import { gitLabProjectUrl } from "./gitlabLinks";

describe("gitLabProjectUrl", () => {
  it("builds an HTTP URL for a self-hosted GitLab", () => {
    expect(gitLabProjectUrl("gitlab.internal/team/app", "http")).toBe(
      "http://gitlab.internal/team/app",
    );
  });

  it("replaces an existing protocol and removes mock suffixes", () => {
    expect(gitLabProjectUrl("https://gitlab.example.com/team/app（モック）/", "http")).toBe(
      "http://gitlab.example.com/team/app",
    );
  });
});
