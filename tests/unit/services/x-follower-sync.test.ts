import { describe, expect, it } from 'vitest';
import {
  computeFollowerDiff,
  daysBetween,
  dedupeFollowersByRestId,
  extractFollowersFromGraphqlResponse,
  isSyncCoverageSufficient,
  isValidXRestId,
  normalizeXUsername,
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
                        content: {
                          itemContent: {
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
                        content: {
                          itemContent: {
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
});
