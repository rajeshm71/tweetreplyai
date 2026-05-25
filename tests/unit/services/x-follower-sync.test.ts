import { describe, expect, it } from 'vitest';
import {
  computeFollowerDiff,
  daysBetween,
  dedupeFollowersByRestId,
  extractFollowersFromGraphqlResponse,
  isFollowerListTimelineEntry,
  isSyncCoverageSufficient,
  isValidXRestId,
  normalizeXUsername,
  X_FOLLOWER_UNFOLLOW_STRIKE_THRESHOLD,
} from '../../../server/services/x-follower-sync';

describe('x-follower-sync', () => {
  it('normalizes X usernames', () => {
    expect(normalizeXUsername('@Alice')).toBe('alice');
    expect(normalizeXUsername('  Bob  ')).toBe('bob');
  });

  it('computes new follows and unfollows', () => {
    const previous = ['1', '2', '3'];
    const incoming = [
      { xUserId: '2', username: 'b' },
      { xUserId: '3', username: 'c' },
      { xUserId: '4', username: 'd' },
    ];
    const prevMap = new Map([
      ['1', { followerUsername: 'a', firstSeenAt: new Date('2026-01-01') }],
      ['2', { followerUsername: 'b', firstSeenAt: new Date('2026-01-02') }],
    ]);

    const diff = computeFollowerDiff(previous, incoming, prevMap);
    expect(diff.newFollows.map((f) => f.xUserId)).toEqual(['4']);
    expect(diff.unfollows.map((f) => f.followerXUserId)).toEqual(['1']);
    expect(diff.totalActive).toBe(3);
  });

  it('treats re-follow as new follow when absent from previous active set', () => {
    const diff = computeFollowerDiff(
      ['1'],
      [
        { xUserId: '1', username: 'a' },
        { xUserId: '2', username: 'b' },
      ],
      new Map(),
    );
    expect(diff.newFollows).toHaveLength(1);
    expect(diff.newFollows[0].xUserId).toBe('2');
    expect(diff.unfollows).toHaveLength(0);
  });

  it('validates sync coverage', () => {
    expect(isSyncCoverageSufficient(0, 0)).toBe(true);
    expect(isSyncCoverageSufficient(100, 0)).toBe(true);
    expect(isSyncCoverageSufficient(90, 100)).toBe(true);
    expect(isSyncCoverageSufficient(50, 100)).toBe(false);
  });

  it('computes whole-day duration between dates', () => {
    const start = new Date('2026-01-01T12:00:00Z');
    const end = new Date('2026-01-03T01:00:00Z');
    expect(daysBetween(start, end)).toBe(1);
  });

  it('accepts only numeric X rest_id values', () => {
    expect(isValidXRestId('123456789')).toBe(true);
    expect(isValidXRestId('alice')).toBe(false);
    expect(isValidXRestId('')).toBe(false);
    expect(isValidXRestId('12abc')).toBe(false);
  });

  it('dedupes followers by rest_id and drops invalid ids', () => {
    const deduped = dedupeFollowersByRestId([
      { xUserId: '111', username: 'a', displayName: 'A' },
      { xUserId: '111', username: 'a', displayName: 'A Updated' },
      { xUserId: 'bob', username: 'b' },
      { xUserId: '222', username: 'c' },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((f) => f.xUserId === '111')?.displayName).toBe('A Updated');
    expect(deduped.map((f) => f.xUserId)).toEqual(['111', '222']);
  });

  it('extracts followers from GraphQL timeline JSON', () => {
    const fixture = {
      data: {
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    entries: [
                      {
                        entryId: 'user-999001',
                        content: {
                          itemContent: {
                            itemType: 'TimelineUser',
                            __typename: 'TimelineUser',
                            user_results: {
                              result: {
                                rest_id: '999001',
                                core: { screen_name: 'fan_one', name: 'Fan One' },
                                legacy: { followers_count: 10 },
                              },
                            },
                          },
                        },
                      },
                      {
                        entryId: 'user-999002',
                        content: {
                          itemContent: {
                            itemType: 'TimelineUser',
                            __typename: 'TimelineUser',
                            user_results: {
                              result: {
                                rest_id: '999002',
                                legacy: {
                                  screen_name: 'fan_two',
                                  name: 'Fan Two',
                                  profile_image_url_https: 'https://x.com/a.jpg',
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };

    const followers = extractFollowersFromGraphqlResponse(fixture);
    expect(followers).toHaveLength(2);
    expect(followers[0]).toMatchObject({ xUserId: '999001', username: 'fan_one' });
    expect(followers[1]).toMatchObject({ xUserId: '999002', username: 'fan_two' });
  });

  it('ignores suggestion modules, embedded tweet authors, and viewer info', () => {
    const fixture = {
      data: {
        viewer: {
          user_results: {
            result: {
              rest_id: '777',
              core: { screen_name: 'me', name: 'Me' },
            },
          },
        },
        user: {
          result: {
            timeline: {
              timeline: {
                instructions: [
                  {
                    entries: [
                      // Real follower entry — should be kept
                      {
                        entryId: 'user-111',
                        content: {
                          itemContent: {
                            itemType: 'TimelineUser',
                            user_results: {
                              result: {
                                rest_id: '111',
                                core: { screen_name: 'real_follower' },
                              },
                            },
                          },
                        },
                      },
                      // who-to-follow / Connect module — should be rejected
                      {
                        entryId: 'connect-module-1',
                        content: {
                          entryType: 'TimelineTimelineModule',
                          itemContent: {
                            itemType: 'TimelineUser',
                            user_results: {
                              result: {
                                rest_id: '222',
                                core: { screen_name: 'suggestion' },
                              },
                            },
                          },
                        },
                      },
                      // Embedded tweet entry (different itemType) — should be rejected
                      {
                        entryId: 'tweet-333',
                        content: {
                          itemContent: {
                            itemType: 'TimelineTweet',
                            tweet_results: {
                              result: {
                                rest_id: '333',
                                core: { user_results: { result: { rest_id: '444', core: { screen_name: 'pinned_author' } } } },
                              },
                            },
                          },
                        },
                      },
                      // Cursor entry — should be rejected
                      {
                        entryId: 'cursor-bottom-555',
                        content: {
                          itemContent: { itemType: 'TimelineTimelineCursor', value: 'next' },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    };

    const followers = extractFollowersFromGraphqlResponse(fixture);
    expect(followers).toHaveLength(1);
    expect(followers[0].xUserId).toBe('111');
    expect(followers[0].username).toBe('real_follower');
  });

  it('isFollowerListTimelineEntry rejects non-TimelineUser entries', () => {
    expect(
      isFollowerListTimelineEntry({
        entryId: 'user-1',
        content: { itemContent: { itemType: 'TimelineUser', user_results: { result: {} } } },
      }),
    ).toBe(true);
    expect(
      isFollowerListTimelineEntry({
        entryId: 'connect-module-1',
        content: { itemContent: { itemType: 'TimelineUser' } },
      }),
    ).toBe(false);
    expect(
      isFollowerListTimelineEntry({
        entryId: 'user-1',
        content: { itemContent: { itemType: 'TimelineTweet' } },
      }),
    ).toBe(false);
    expect(isFollowerListTimelineEntry(null)).toBe(false);
    expect(isFollowerListTimelineEntry({})).toBe(false);
  });

  it('exports a two-strike unfollow threshold', () => {
    expect(X_FOLLOWER_UNFOLLOW_STRIKE_THRESHOLD).toBe(2);
  });
});
