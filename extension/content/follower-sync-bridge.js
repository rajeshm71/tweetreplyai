/**
 * Isolated-world bridge for follower sync on x.com.
 */
(function () {
  if (window.__TRAI_FOLLOWER_SYNC_BRIDGE__) return;
  window.__TRAI_FOLLOWER_SYNC_BRIDGE__ = true;

  var pendingJob = null;
  var chunkIndex = 0;
  var uploadQueue = Promise.resolve();
  var syncFailed = false;
  var LOG_PREFIX = '[TweetReply Followers][bridge]';

  function log(stage, message, data) {
    try {
      if (data !== undefined) console.log(LOG_PREFIX, stage + ':', message, data);
      else console.log(LOG_PREFIX, stage + ':', message);
    } catch (_e) {}
  }

  function enqueueUpload(fn) {
    uploadQueue = uploadQueue
      .then(fn)
      .catch(function (err) {
        log('upload-error', 'Upload queue failed', { error: err && err.message ? err.message : String(err) });
        if (!syncFailed && pendingJob) {
          syncFailed = true;
          var jobId = pendingJob.syncJobId;
          pendingJob = null;
          chunkIndex = 0;
          chrome.runtime.sendMessage({
            action: 'followerSyncFail',
            syncJobId: jobId,
            error: err && err.message ? err.message : 'Batch upload failed',
          });
          postProgress({
            syncJobId: jobId,
            status: 'error',
            error: err && err.message ? err.message : 'Batch upload failed',
          });
        }
        throw err;
      });
    return uploadQueue;
  }

  function getLoggedInUsername() {
    var link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      var match = href.match(/^\/([^/?]+)/);
      if (match && match[1] && match[1] !== 'home') return match[1];
    }
    var switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (switcher) {
      var text = switcher.textContent || '';
      var at = text.match(/@([A-Za-z0-9_]+)/);
      if (at) return at[1];
    }
    return null;
  }

  function postProgress(payload) {
    try {
      chrome.runtime.sendMessage(Object.assign({ action: 'followerSyncProgress' }, payload));
    } catch (_e) {}
  }

  function uploadBatch(followers, partial) {
    if (!pendingJob || !followers.length || syncFailed) return Promise.resolve();
    chunkIndex += 1;
    log('batch-upload', 'Uploading batch to background', {
      syncJobId: pendingJob.syncJobId,
      chunkIndex: chunkIndex,
      count: followers.length,
      partial: !!partial,
    });
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        {
          action: 'followerSyncBatch',
          syncJobId: pendingJob.syncJobId,
          chunkIndex: chunkIndex,
          followers: followers,
          isFinal: !partial,
        },
        function (response) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.success) {
            reject(new Error((response && response.error) || 'Batch upload failed'));
            return;
          }
          log('batch-upload', 'Batch uploaded successfully', { chunkIndex: chunkIndex });
          resolve(response);
        },
      );
    });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || !pendingJob || syncFailed) return;
    var data = event.data;

    if (data.type === 'TRAI_FOLLOWER_BATCH') {
      if (data.progress) {
        log('batch-received', 'Progress from main', data.progress);
        postProgress({
          syncJobId: pendingJob.syncJobId,
          status: 'collecting',
          collected: data.progress.collected,
          uploaded: data.progress.uploaded || 0,
        });
      }
      if (data.followers && data.followers.length) {
        log('batch-received', 'Follower batch from main', { count: data.followers.length, partial: !!data.partial });
        enqueueUpload(function () {
          return uploadBatch(data.followers, !!data.partial);
        });
      }
      return;
    }

    if (data.type === 'TRAI_FOLLOWER_SYNC_DONE') {
      log('complete', 'Main finished collection', {
        total: data.total,
        profileFollowerCount: data.profileFollowerCount,
      });
      postProgress({
        syncJobId: pendingJob.syncJobId,
        status: 'completing',
        collected: data.total,
      });
      enqueueUpload(function () {
        if (syncFailed) return Promise.resolve();
        return new Promise(function (resolve, reject) {
          chrome.runtime.sendMessage(
            {
              action: 'followerSyncComplete',
              syncJobId: pendingJob.syncJobId,
              followerCount: data.total,
              profileFollowerCount: data.profileFollowerCount,
              syncedCount: data.total,
            },
            function (response) {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              var jobId = pendingJob ? pendingJob.syncJobId : null;
              pendingJob = null;
              chunkIndex = 0;
              if (!response || !response.success) {
                reject(new Error((response && response.error) || 'Failed to complete sync'));
                return;
              }
              log('complete', 'Sync completed via API', { jobId: jobId, result: response && response.result });
              postProgress({
                syncJobId: jobId,
                status: 'completed',
                collected: data.total,
                result: response && response.result,
              });
              resolve();
            },
          );
        });
      });
      return;
    }

    if (data.type === 'TRAI_FOLLOWER_SYNC_ERROR') {
      log('sync-error', 'Error from main', { message: data.message });
      syncFailed = true;
      var failJobId = pendingJob ? pendingJob.syncJobId : null;
      pendingJob = null;
      chunkIndex = 0;
      chrome.runtime.sendMessage({
        action: 'followerSyncFail',
        syncJobId: failJobId,
        error: data.message,
      });
      postProgress({ syncJobId: failJobId, status: 'error', error: data.message });
    }
  });

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (message.action !== 'runFollowerSync') return false;

    (async function () {
      try {
        log('run-request', 'Received runFollowerSync', {
          syncJobId: message.syncJobId,
          xUsername: message.xUsername,
          path: location.pathname,
        });
        var xUsername = message.xUsername;
        var loggedIn = getLoggedInUsername();
        if (!loggedIn) {
          log('auth-check', 'Failed — not logged in');
          sendResponse({ success: false, error: 'Could not detect logged-in X account. Open x.com while logged in.' });
          return;
        }
        if (loggedIn.toLowerCase() !== String(xUsername || '').toLowerCase()) {
          log('auth-check', 'Failed — username mismatch', { loggedIn: loggedIn, expected: xUsername });
          sendResponse({
            success: false,
            error: 'Logged into X as @' + loggedIn + ', expected @' + xUsername,
          });
          return;
        }
        log('auth-check', 'Passed', { loggedIn: loggedIn });

        var followersPath = '/' + xUsername + '/followers';
        if (location.pathname.toLowerCase() !== followersPath.toLowerCase()) {
          log('navigate', 'Redirecting to followers page', { target: followersPath });
          location.href = 'https://x.com' + followersPath;
          sendResponse({ success: true, navigating: true });
          return;
        }

        pendingJob = {
          syncJobId: message.syncJobId,
          xUsername: xUsername,
        };
        chunkIndex = 0;
        syncFailed = false;

        log('job-started', 'Posting TRAI_FOLLOWER_SYNC_START to main world', { syncJobId: message.syncJobId });
        window.postMessage(
          {
            type: 'TRAI_FOLLOWER_SYNC_START',
            options: { batchSize: message.batchSize || 250 },
          },
          '*',
        );

        sendResponse({ success: true, started: true });
      } catch (err) {
        log('run-error', 'Failed to start sync', { error: err.message || String(err) });
        sendResponse({ success: false, error: err.message || 'Failed to start follower sync' });
      }
    })();

    return true;
  });
})();

