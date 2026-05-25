/**
 * MAIN world follower sync for x.com followers page.
 * Paginates via scroll + GraphQL intercept; posts batches to isolated bridge.
 */
(function () {
  if (window.__TRAI_FOLLOWER_SYNC_MAIN__) return;
  window.__TRAI_FOLLOWER_SYNC_MAIN__ = true;

  var MSG_BATCH = 'TRAI_FOLLOWER_BATCH';
  var MSG_DONE = 'TRAI_FOLLOWER_SYNC_DONE';
  var MSG_ERROR = 'TRAI_FOLLOWER_SYNC_ERROR';
  var MSG_START = 'TRAI_FOLLOWER_SYNC_START';

  var collecting = false;
  var seenRestIds = {};
  var usernameToRestId = {};
  var collected = [];

  function isValidRestId(id) {
    return /^\d+$/.test(String(id || '').trim());
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function jitter(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function upsertFollower(follower) {
    if (!follower || !follower.xUserId || !isValidRestId(follower.xUserId) || !follower.username) return false;
    var restId = String(follower.xUserId).trim();
    var usernameKey = String(follower.username).toLowerCase();
    usernameToRestId[usernameKey] = restId;
    if (seenRestIds[restId]) {
      var idx = collected.findIndex(function (c) { return c.xUserId === restId; });
      if (idx >= 0) {
        collected[idx] = Object.assign({}, collected[idx], follower, { xUserId: restId });
      }
      return false;
    }
    seenRestIds[restId] = true;
    collected.push({
      xUserId: restId,
      username: follower.username,
      displayName: follower.displayName,
      avatarUrl: follower.avatarUrl,
      followerCount: follower.followerCount,
      verified: follower.verified,
    });
    return true;
  }

  function parseUserFromGraph(obj, out, depth) {
    if (depth > 25 || !obj || typeof obj !== 'object') return;
    if (obj.rest_id && obj.core && obj.core.screen_name) {
      out.push({
        xUserId: String(obj.rest_id),
        username: String(obj.core.screen_name),
        displayName: obj.core.name ? String(obj.core.name) : undefined,
        avatarUrl: obj.avatar && obj.avatar.image_url ? String(obj.avatar.image_url) : undefined,
        followerCount: obj.legacy && typeof obj.legacy.followers_count === 'number' ? obj.legacy.followers_count : undefined,
        verified: !!(obj.is_blue_verified || (obj.verification && obj.verification.verified)),
      });
    } else if (obj.rest_id && obj.legacy && obj.legacy.screen_name) {
      out.push({
        xUserId: String(obj.rest_id),
        username: String(obj.legacy.screen_name),
        displayName: obj.legacy.name ? String(obj.legacy.name) : undefined,
        avatarUrl: obj.legacy.profile_image_url_https ? String(obj.legacy.profile_image_url_https) : undefined,
        followerCount: typeof obj.legacy.followers_count === 'number' ? obj.legacy.followers_count : undefined,
        verified: !!obj.legacy.verified,
      });
    }
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) parseUserFromGraph(obj[i], out, depth + 1);
    } else {
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) parseUserFromGraph(obj[keys[j]], out, depth + 1);
    }
  }

  function ingestGraphText(text) {
    try {
      var data = JSON.parse(text);
      var users = [];
      parseUserFromGraph(data, users, 0);
      var added = 0;
      for (var i = 0; i < users.length; i++) {
        if (upsertFollower(users[i])) added++;
      }
      return added;
    } catch (_e) {
      return 0;
    }
  }

  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url ? args[0].url : '';
    return originalFetch.apply(this, args).then(function (response) {
      if (collecting && url.indexOf('/Followers') !== -1) {
        response.clone().text().then(function (text) {
          ingestGraphText(text);
        }).catch(function () {});
      }
      return response;
    });
  };

  function extractRestIdFromCell(cell) {
    var el = cell.closest('[data-user-id]') || cell.querySelector('[data-user-id]');
    if (el) {
      var id = el.getAttribute('data-user-id');
      if (isValidRestId(id)) return String(id).trim();
    }
    return null;
  }

  function scrapeUserCells() {
    var cells = document.querySelectorAll('[data-testid="UserCell"]');
    var enriched = 0;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var link = cell.querySelector('a[href^="/"]');
      if (!link) continue;
      var href = link.getAttribute('href') || '';
      var parts = href.split('/').filter(Boolean);
      if (!parts.length || parts[0].indexOf('?') !== -1) continue;
      var username = parts[0];
      var usernameKey = username.toLowerCase();
      var nameEl = cell.querySelector('[dir="ltr"] span');
      var avatarEl = cell.querySelector('img[src*="profile_images"]');
      var meta = {
        username: username,
        displayName: nameEl ? nameEl.textContent.trim() : undefined,
        avatarUrl: avatarEl ? avatarEl.getAttribute('src') : undefined,
        verified: !!cell.querySelector('svg[aria-label*="Verified"]'),
      };

      var restId = extractRestIdFromCell(cell) || usernameToRestId[usernameKey];
      if (restId && isValidRestId(restId)) {
        if (upsertFollower(Object.assign({ xUserId: restId }, meta))) enriched++;
      }
    }
    return enriched;
  }

  function getScrollContainer() {
    return (
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('[role="dialog"]') ||
      document.scrollingElement ||
      document.documentElement
    );
  }

  async function scrollFollowersList(maxRounds) {
    var rounds = 0;
    var stale = 0;
    var prevSize = collected.length;
    while (collecting && rounds < maxRounds && stale < 8) {
      var container = getScrollContainer();
      if (container) {
        container.scrollTop = container.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
      }
      await sleep(jitter(900, 1800));
      scrapeUserCells();
      if (collected.length === prevSize) stale++;
      else stale = 0;
      prevSize = collected.length;
      rounds++;
      window.postMessage({
        type: MSG_BATCH,
        progress: { collected: collected.length, round: rounds },
        followers: [],
        partial: true,
      }, '*');
    }
  }

  async function runSync(options) {
    if (collecting) return;
    collecting = true;
    seenRestIds = {};
    usernameToRestId = {};
    collected = [];
    var batchSize = options && options.batchSize ? options.batchSize : 500;
    var maxRounds = options && options.maxRounds ? options.maxRounds : 120;

    try {
      await sleep(1500);
      scrapeUserCells();
      await scrollFollowersList(maxRounds);
      scrapeUserCells();

      if (!collected.length) {
        window.postMessage({
          type: MSG_ERROR,
          message: 'No followers with stable IDs were collected. Stay on your followers page and try again.',
        }, '*');
        return;
      }

      for (var i = 0; i < collected.length; i += batchSize) {
        window.postMessage({
          type: MSG_BATCH,
          progress: { collected: collected.length, uploaded: Math.min(i + batchSize, collected.length) },
          followers: collected.slice(i, i + batchSize),
          partial: i + batchSize < collected.length,
        }, '*');
      }

      window.postMessage({
        type: MSG_DONE,
        total: collected.length,
        followers: collected,
      }, '*');
    } catch (err) {
      window.postMessage({
        type: MSG_ERROR,
        message: err && err.message ? err.message : 'Follower sync failed',
      }, '*');
    } finally {
      collecting = false;
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type === MSG_START) {
      runSync(event.data.options || {});
    }
  });
})();
