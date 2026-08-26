import type { GitLabProtocol } from "./types";

/** Build a project URL from the canonical host/path shown in the header.
 * The protocol is explicit because self-hosted GitLab is often HTTP-only. */
export function gitLabProjectUrl(repo: string, protocol: GitLabProtocol): string {
  const clean = repo
    .replace(/（[^）]*）/g, "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `${protocol}://${clean}`;
}
