import type { XFollowerDiffResult, XFollowerSyncInput } from '../../shared/types.js';

export const X_FOLLOWER_SYNC_BATCH_SIZE = 500;
export const X_FOLLOWER_SYNC_MIN_COVERAGE_RATIO = 0.85;

export function normalizeXUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidXRestId(xUserId: string): boolean {
  // X rest_id is numeric; reject DOM fallback keys (lowercase usernames).
  return /^\d+$/.test(String(xUserId || '').trim());
}

export function dedupeFollowersByRestId(followers: XFollowerSyncInput[]): XFollowerSyncInput[] {
  const byId = new Map<string, XFollowerSyncInput>();
  for (const follower of followers) {
    if (!follower.xUserId || !isValidXRestId(follower.xUserId)) continue;
    const key = follower.xUserId.trim();
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, follower);
      continue;
    }
    // Prefer richer metadata when the same rest_id appears in multiple chunks.
    byId.set(key, {
      ...existing,
      ...follower,
      username: follower.username || existing.username,
      displayName: follower.displayName ?? existing.displayName,
      avatarUrl: follower.avatarUrl ?? existing.avatarUrl,
    });
  }
  return Array.from(byId.values());
}

export function computeFollowerDiff(
  previousActiveIds: string[],
  incomingFollowers: XFollowerSyncInput[],
  previousStatesById: Map<string, { followerUsername: string; firstSeenAt?: Date }>,
): XFollowerDiffResult {
  const incomingById = new Map<string, XFollowerSyncInput>();
  for (const follower of incomingFollowers) {
    if (!follower.xUserId) continue;
    incomingById.set(follower.xUserId, follower);
  }

  const previousSet = new Set(previousActiveIds);
  const incomingSet = new Set(incomingById.keys());

  const newFollows: XFollowerSyncInput[] = [];
  for (const id of incomingSet) {
    if (!previousSet.has(id)) {
      const follower = incomingById.get(id);
      if (follower) newFollows.push(follower);
    }
  }

  const unfollows: XFollowerDiffResult['unfollows'] = [];
  for (const id of previousSet) {
    if (!incomingSet.has(id)) {
      const prev = previousStatesById.get(id);
      unfollows.push({
        followerXUserId: id,
        followerUsername: prev?.followerUsername ?? id,
        firstSeenAt: prev?.firstSeenAt,
      });
    }
  }

  return {
    newFollows,
    unfollows,
    totalActive: incomingSet.size,
  };
}

export function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function isSyncCoverageSufficient(
  incomingCount: number,
  previousActiveCount: number,
): boolean {
  if (previousActiveCount <= 0) return incomingCount > 0 || previousActiveCount === 0;
  return incomingCount / previousActiveCount >= X_FOLLOWER_SYNC_MIN_COVERAGE_RATIO;
}

export const DAY_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function userFromGraphResult(result: unknown): XFollowerSyncInput | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.__typename === 'UserUnavailable') return null;

  const core = r.core as Record<string, unknown> | undefined;
  const legacy = r.legacy as Record<string, unknown> | undefined;
  const avatar = r.avatar as Record<string, unknown> | undefined;

  if (r.rest_id && core?.screen_name) {
    return {
      xUserId: String(r.rest_id),
      username: String(core.screen_name),
      displayName: core.name ? String(core.name) : undefined,
      avatarUrl: avatar?.image_url ? String(avatar.image_url) : undefined,
      followerCount:
        legacy && typeof legacy.followers_count === 'number' ? legacy.followers_count : undefined,
      verified: !!(r.is_blue_verified || (r.verification as Record<string, unknown>)?.verified),
    };
  }
  if (r.rest_id && legacy?.screen_name) {
    return {
      xUserId: String(r.rest_id),
      username: String(legacy.screen_name),
      displayName: legacy.name ? String(legacy.name) : undefined,
      avatarUrl: legacy.profile_image_url_https
        ? String(legacy.profile_image_url_https)
        : undefined,
      followerCount:
        typeof legacy.followers_count === 'number' ? legacy.followers_count : undefined,
      verified: !!legacy.verified,
    };
  }
  return null;
}

/** Extract followers from X GraphQL timeline JSON (used by extension + tests). */
export function extractFollowersFromGraphqlResponse(data: unknown): XFollowerSyncInput[] {
  const users: XFollowerSyncInput[] = [];

  function walkInstructions(obj: unknown, depth: number) {
    if (depth > 30 || !obj || typeof obj !== 'object') return;
    const record = obj as Record<string, unknown>;

    if (Array.isArray(record.instructions)) {
      for (const inst of record.instructions as Array<Record<string, unknown>>) {
        if (Array.isArray(inst.entries)) {
          for (const entry of inst.entries as Array<Record<string, unknown>>) {
            const content = entry.content as Record<string, unknown> | undefined;
            const itemContent = content?.itemContent as Record<string, unknown> | undefined;
            const userResults = itemContent?.user_results as Record<string, unknown> | undefined;
            const user = userFromGraphResult(userResults?.result);
            if (user && isValidXRestId(user.xUserId)) users.push(user);
          }
        }
      }
    }

    if (Array.isArray(obj)) {
      for (const item of obj) walkInstructions(item, depth + 1);
    } else {
      for (const key of Object.keys(record)) walkInstructions(record[key], depth + 1);
    }
  }

  walkInstructions(data, 0);
  return dedupeFollowersByRestId(users);
}
