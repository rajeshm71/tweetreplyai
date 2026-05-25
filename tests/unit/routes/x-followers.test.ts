import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp } from '../../helpers/request';
import { signTestJwt } from '../../helpers/jwt';

vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'test-user' };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn(() => 'test-user'),
}));
vi.mock('../../../server/localAuth', () => ({ setupLocalAuth: vi.fn() }));

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getUser: vi.fn(),
    getXProfileByUserId: vi.fn(),
    upsertXProfile: vi.fn(),
    updateXProfile: vi.fn(),
    insertFollowerSyncStaging: vi.fn(),
    getStagingFollowers: vi.fn(),
    getActiveFollowerIds: vi.fn(),
    getActiveFollowerStatesByIds: vi.fn(),
    applyFollowerDiff: vi.fn(),
    establishFollowerBaseline: vi.fn(),
    clearFollowerSyncStaging: vi.fn(),
    countFollowEventsSince: vi.fn(),
    getFollowStatsDaily: vi.fn(),
    getFollowStatsDailyForDate: vi.fn(),
    countActiveFollowers: vi.fn(),
    getUnfollowDayOfWeekPattern: vi.fn(),
    getAvgUnfollowDurationDays: vi.fn(),
    getFollowEvents: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: mockStorage,
}));

describe('X follower routes', () => {
  let app: ReturnType<typeof createTestApp>;
  const authToken = signTestJwt({ id: 'test-user', email: 'test@example.com' });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getUser.mockResolvedValue({ id: 'test-user', xUsername: 'alice' });
    mockStorage.getXProfileByUserId.mockResolvedValue(undefined);
    mockStorage.upsertXProfile.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      followerCount: 0,
      followingCount: 0,
      lastSyncStatus: 'idle',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStorage.updateXProfile.mockImplementation(async (_id, updates) => ({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      followerCount: 0,
      followingCount: 0,
      lastSyncStatus: updates.lastSyncStatus || 'running',
      syncJobId: updates.syncJobId || 'job-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it('rejects sync start when logged-in X user mismatches saved handle', async () => {
    const res = await app.raw()
      .post('/api/x-followers/sync/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ loggedInXUsername: 'bob' });

    expect(res.status).toBe(403);
  });

  it('starts sync when ownership matches', async () => {
    const res = await app.raw()
      .post('/api/x-followers/sync/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ loggedInXUsername: 'alice' });

    expect(res.status).toBe(200);
    expect(res.body.syncJobId).toBeTruthy();
    expect(res.body.xUsername).toBe('alice');
  });

  it('returns empty stats when profile missing', async () => {
    const res = await app.raw()
      .get('/api/x-followers/stats')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.unfollowersToday).toBe(0);
    expect(res.body.syncedFollowerCount).toBe(0);
    expect(res.body.yesterdayFollowerCount).toBeNull();
    expect(res.body.coveragePercent).toBeNull();
  });

  it('returns extended stats when profile exists', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      followerCount: 1000,
      followingCount: 0,
      lastSyncAt: new Date('2026-05-24T12:00:00Z'),
      lastSyncStatus: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStorage.countFollowEventsSince.mockResolvedValue(0);
    mockStorage.getFollowStatsDaily.mockResolvedValue([]);
    mockStorage.getUnfollowDayOfWeekPattern.mockResolvedValue([]);
    mockStorage.getAvgUnfollowDurationDays.mockResolvedValue(null);
    mockStorage.countActiveFollowers.mockResolvedValue(850);
    mockStorage.getFollowStatsDailyForDate.mockResolvedValue({
      id: 'daily-1',
      xProfileId: 'profile-1',
      date: '2026-05-24',
      newFollowers: 0,
      unfollowers: 0,
      netChange: 0,
      totalActive: 830,
    });

    const res = await app.raw()
      .get('/api/x-followers/stats')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.followerCount).toBe(1000);
    expect(res.body.syncedFollowerCount).toBe(850);
    expect(res.body.yesterdayFollowerCount).toBe(830);
    expect(res.body.coveragePercent).toBe(85);
  });

  it('allows sync start during cooldown when coverage is low', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      followerCount: 1000,
      followingCount: 0,
      lastSyncAt: new Date(),
      lastSyncStatus: 'completed',
      syncJobId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockStorage.countActiveFollowers.mockResolvedValue(51);
    mockStorage.updateXProfile.mockImplementation(async (_id, updates) => ({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      followerCount: 1000,
      lastSyncStatus: updates.lastSyncStatus || 'running',
      syncJobId: updates.syncJobId || 'job-new',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const res = await app.raw()
      .post('/api/x-followers/sync/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ loggedInXUsername: 'alice' });

    expect(res.status).toBe(200);
    expect(res.body.syncJobId).toBeTruthy();
  });

  it('persists profileFollowerCount on sync complete', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      syncJobId: 'job-1',
      lastSyncStatus: 'running',
    });
    mockStorage.getStagingFollowers.mockResolvedValue([
      { xUserId: '100', username: 'fan1' },
    ]);
    mockStorage.getActiveFollowerIds.mockResolvedValue([]);
    mockStorage.establishFollowerBaseline.mockResolvedValue(undefined);
    mockStorage.clearFollowerSyncStaging.mockResolvedValue(undefined);
    mockStorage.updateXProfile.mockResolvedValue({});

    const res = await app.raw()
      .post('/api/x-followers/sync/complete')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        syncJobId: 'job-1',
        syncedCount: 1,
        profileFollowerCount: 500,
      });

    expect(res.status).toBe(200);
    expect(mockStorage.updateXProfile).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({ followerCount: 500 }),
    );
    expect(res.body.profileFollowerCount).toBe(500);
    expect(res.body.syncedCount).toBe(1);
  });

  it('rejects sync complete when job is not running', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      syncJobId: 'job-1',
      lastSyncStatus: 'idle',
    });

    const res = await app.raw()
      .post('/api/x-followers/sync/complete')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ syncJobId: 'job-1' });

    expect(res.status).toBe(409);
    expect(mockStorage.establishFollowerBaseline).not.toHaveBeenCalled();
    expect(mockStorage.applyFollowerDiff).not.toHaveBeenCalled();
  });

  it('establishes baseline on first sync without diff events', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      syncJobId: 'job-1',
      lastSyncStatus: 'running',
    });
    mockStorage.getStagingFollowers.mockResolvedValue([
      { xUserId: '100', username: 'fan1' },
      { xUserId: '200', username: 'fan2' },
    ]);
    mockStorage.getActiveFollowerIds.mockResolvedValue([]);
    mockStorage.establishFollowerBaseline.mockResolvedValue(undefined);
    mockStorage.clearFollowerSyncStaging.mockResolvedValue(undefined);
    mockStorage.updateXProfile.mockResolvedValue({});

    const res = await app.raw()
      .post('/api/x-followers/sync/complete')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ syncJobId: 'job-1', followerCount: 2 });

    expect(res.status).toBe(200);
    expect(mockStorage.establishFollowerBaseline).toHaveBeenCalledWith(
      'profile-1',
      expect.arrayContaining([
        expect.objectContaining({ xUserId: '100', username: 'fan1' }),
      ]),
      2,
    );
    expect(mockStorage.applyFollowerDiff).not.toHaveBeenCalled();
  });

  it('filters non-numeric follower ids from sync batches', async () => {
    mockStorage.getXProfileByUserId.mockResolvedValue({
      id: 'profile-1',
      userId: 'test-user',
      xUsername: 'alice',
      syncJobId: 'job-1',
      lastSyncStatus: 'running',
    });
    mockStorage.insertFollowerSyncStaging.mockResolvedValue(1);

    const res = await app.raw()
      .post('/api/x-followers/sync-batch')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        syncJobId: 'job-1',
        chunkIndex: 1,
        followers: [
          { xUserId: '12345', username: 'valid' },
          { xUserId: 'invaliduser', username: 'bad' },
        ],
      });

    expect(res.status).toBe(200);
    expect(mockStorage.insertFollowerSyncStaging).toHaveBeenCalledWith(
      'job-1',
      'profile-1',
      [expect.objectContaining({ xUserId: '12345', username: 'valid' })],
    );
  });
});
