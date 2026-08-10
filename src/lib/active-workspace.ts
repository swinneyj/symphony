"use client";

/**
 * Active-workspace resolution.
 *
 * The app is multi-workspace: a user can own several workspaces and be a
 * member (admin/member/viewer) of others. Historically every page grabbed
 * `workspaces[0]` (newest-first), which made a user's data appear to
 * "disappear" the moment they joined a newer workspace.
 *
 * Rules:
 *  1. A persisted selection (localStorage) wins, if the user is still a member.
 *  2. Otherwise fall back to the user's OWN most-recent workspace (role=owner),
 *     so a fresh login always shows the user's own data.
 *  3. Otherwise fall back to the newest workspace overall.
 */

const STORAGE_KEY = "symphony:activeWorkspaceId";

export interface WorkspaceSummary {
  id: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  createdAt?: string | Date | null;
  role?: string | null;
}

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeWorkspaceId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function resolveActiveWorkspace<T extends WorkspaceSummary>(
  workspaces: T[]
): T | null {
  if (!workspaces || workspaces.length === 0) return null;

  const stored = getStoredWorkspaceId();
  if (stored) {
    const match = workspaces.find((w) => w.id === stored);
    if (match) return match;
  }

  const owned = workspaces.filter((w) => w.role === "owner");
  const pool = owned.length > 0 ? owned : workspaces;
  const sorted = [...pool].sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
  return sorted[0];
}
