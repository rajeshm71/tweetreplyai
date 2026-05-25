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

  function enqueueUpload(fn) {
    uploadQueue = uploadQueue
      .then(fn)
      .catch(function (err) {
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
        postProgress({
          syncJobId: pendingJob.syncJobId,
          status: 'collecting',
          collected: data.progress.collected,
          uploaded: data.progress.uploaded || 0,
        });
      }
      if (data.followers && data.followers.length) {
        enqueueUpload(function () {
          return uploadBatch(data.followers, !!data.partial);
        });
      }
      return;
    }

    if (data.type === 'TRAI_FOLLOWER_SYNC_DONE') {
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
        var xUsername = message.xUsername;
        var loggedIn = getLoggedInUsername();
        if (!loggedIn) {
          sendResponse({ success: false, error: 'Could not detect logged-in X account. Open x.com while logged in.' });
          return;
        }
        if (loggedIn.toLowerCase() !== String(xUsername || '').toLowerCase()) {
          sendResponse({
            success: false,
            error: 'Logged into X as @' + loggedIn + ', expected @' + xUsername,
          });
          return;
        }

        var followersPath = '/' + xUsername + '/followers';
        if (location.pathname.toLowerCase() !== followersPath.toLowerCase()) {
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

        window.postMessage(
          {
            type: 'TRAI_FOLLOWER_SYNC_START',
            options: { batchSize: message.batchSize || 500, maxRounds: message.maxRounds || 120 },
          },
          '*',
        );

        sendResponse({ success: true, started: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message || 'Failed to start follower sync' });
      }
    })();

    return true;
  });
})();
