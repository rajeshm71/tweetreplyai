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
  var MSG_GRAPH_USER = 'TRAI_FOLLOWER_GRAPH_USER';

  var FOLLOWER_LIST_PATTERNS = [
    '/Followers',
    '/BlueVerifiedFollowers',
    '/FollowersYouKnow',
    '/Following',
  ];

  var collecting = false;
  var seenRestIds = {};
  var usernameToRestId = {};
  var collected = [];
  var graphUsersReceived = false;

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

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      return new URL(url, location.href).href;
    } catch (_e) {
      return url;
    }
  }

  function normalizeFetchInput(input) {
    if (typeof input === 'string') return normalizeUrl(input);
    if (typeof URL !== 'undefined' && input instanceof URL) return normalizeUrl(input.href);
    if (input && typeof input === 'object' && typeof input.url === 'string') return normalizeUrl(input.url);
    return '';
  }

  function isFollowerListUrl(url) {
    var abs = normalizeUrl(url);
    if (!abs) return false;
    for (var i = 0; i < FOLLOWER_LIST_PATTERNS.length; i++) {
      if (abs.indexOf(FOLLOWER_LIST_PATTERNS[i]) !== -1) return true;
    }
    return abs.indexOf('/i/api/graphql/') !== -1;
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

  function userFromResult(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.__typename === 'UserUnavailable') return null;
    if (result.rest_id && result.core && result.core.screen_name) {
      return {
        xUserId: String(result.rest_id),
        username: String(result.core.screen_name),
        displayName: result.core.name ? String(result.core.name) : undefined,
        avatarUrl: result.avatar && result.avatar.image_url ? String(result.avatar.image_url) : undefined,
        followerCount: result.legacy && typeof result.legacy.followers_count === 'number' ? result.legacy.followers_count : undefined,
        verified: !!(result.is_blue_verified || (result.verification && result.verification.verified)),
      };
    }
    if (result.rest_id && result.legacy && result.legacy.screen_name) {
      return {
        xUserId: String(result.rest_id),
        username: String(result.legacy.screen_name),
        displayName: result.legacy.name ? String(result.legacy.name) : undefined,
        avatarUrl: result.legacy.profile_image_url_https ? String(result.legacy.profile_image_url_https) : undefined,
        followerCount: typeof result.legacy.followers_count === 'number' ? result.legacy.followers_count : undefined,
        verified: !!result.legacy.verified,
      };
    }
    return null;
  }

  function parseTimelineEntries(data) {
    var users = [];
    if (!data || typeof data !== 'object') return users;

    function walkInstructions(obj, depth) {
      if (depth > 30 || !obj || typeof obj !== 'object') return;
      if (obj.instructions && Array.isArray(obj.instructions)) {
        for (var i = 0; i < obj.instructions.length; i++) {
          var inst = obj.instructions[i];
          if (inst.entries && Array.isArray(inst.entries)) {
            for (var j = 0; j < inst.entries.length; j++) {
              var entry = inst.entries[j];
              var content = entry && entry.content;
              var itemContent = content && content.itemContent;
              var userResults = itemContent && itemContent.user_results;
              var user = userFromResult(userResults && userResults.result);
              if (user) users.push(user);
            }
          }
          if (inst.moduleItems && Array.isArray(inst.moduleItems)) {
            for (var k = 0; k < inst.moduleItems.length; k++) {
              var mod = inst.moduleItems[k];
              var modUser = userFromResult(
                mod && mod.item && mod.item.itemContent && mod.item.itemContent.user_results
                  ? mod.item.itemContent.user_results.result
                  : null,
              );
              if (modUser) users.push(modUser);
            }
          }
        }
      }
      if (Array.isArray(obj)) {
        for (var a = 0; a < obj.length; a++) walkInstructions(obj[a], depth + 1);
      } else {
        var keys = Object.keys(obj);
        for (var b = 0; b < keys.length; b++) walkInstructions(obj[keys[b]], depth + 1);
      }
    }

    walkInstructions(data, 0);
    return users;
  }

  function parseUserFromGraph(obj, out, depth) {
    if (depth > 25 || !obj || typeof obj !== 'object') return;
    var direct = userFromResult(obj);
    if (direct) out.push(direct);
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) parseUserFromGraph(obj[i], out, depth + 1);
    } else {
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) parseUserFromGraph(obj[keys[j]], out, depth + 1);
    }
  }

  function ingestGraphText(text, url) {
    try {
      var data = JSON.parse(text);
      var users = parseTimelineEntries(data);
      if (!users.length) {
        parseUserFromGraph(data, users, 0);
      }
      var added = 0;
      for (var i = 0; i < users.length; i++) {
        if (upsertFollower(users[i])) added++;
      }
      if (added > 0) graphUsersReceived = true;
      return added;
    } catch (_e) {
      return 0;
    }
  }

  function ingestGraphResponse(url, text) {
    if (!collecting) return;
    if (!isFollowerListUrl(url)) return;
    ingestGraphText(text, url);
  }

  // Chain fetch — originalFetch is already wrapped by follow-network-interceptor.
  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = normalizeFetchInput(args[0]);
    return originalFetch.apply(this, args).then(function (response) {
      if (collecting && isFollowerListUrl(url)) {
        response.clone().text().then(function (text) {
          ingestGraphResponse(url, text);
        }).catch(function () {});
      }
      return response;
    });
  };

  // Chain XHR — interceptor may have already patched open/send.
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._traiFollowerSyncUrl = url != null ? normalizeUrl(String(url)) : '';
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener(
      'load',
      function () {
        try {
          var u = xhr._traiFollowerSyncUrl || '';
          if (xhr.responseText && collecting && isFollowerListUrl(u)) {
            ingestGraphResponse(u, xhr.responseText);
          }
        } catch (_e) {}
      },
      { once: true },
    );
    return originalXHRSend.apply(this, arguments);
  };

  function extractRestIdFromCell(cell) {
    var el = cell.closest('[data-user-id]') || cell.querySelector('[data-user-id]');
    if (el) {
      var id = el.getAttribute('data-user-id');
      if (isValidRestId(id)) return String(id).trim();
    }
    var userLink = cell.querySelector('a[href*="/i/user/"]');
    if (userLink) {
      var href = userLink.getAttribute('href') || '';
      var match = href.match(/\/i\/user\/(\d+)/);
      if (match && isValidRestId(match[1])) return match[1];
    }
    return null;
  }

  function parseCountText(text) {
    if (!text) return null;
    var cleaned = String(text).replace(/,/g, '').trim();
    var match = cleaned.match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
    if (!match) return null;
    var num = parseFloat(match[1]);
    if (isNaN(num)) return null;
    var suffix = match[2] ? match[2].toUpperCase() : '';
    if (suffix === 'K') num *= 1000;
    if (suffix === 'M') num *= 1000000;
    return Math.round(num);
  }

  function scrapeProfileFollowerCount() {
    var selectors = [
      'a[href$="/followers"] span',
      'a[href*="/followers"] span',
      '[data-testid="primaryColumn"] a[href*="followers"]',
    ];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length; i++) {
        var text = nodes[i].textContent || '';
        if (text.toLowerCase().indexOf('follower') === -1 && !/\d/.test(text)) continue;
        var count = parseCountText(text);
        if (count != null && count >= 0) return count;
      }
    }
    var allLinks = document.querySelectorAll('a[href*="followers"]');
    for (var j = 0; j < allLinks.length; j++) {
      var linkText = allLinks[j].textContent || '';
      if (linkText.toLowerCase().indexOf('follower') === -1) continue;
      var parsed = parseCountText(linkText);
      if (parsed != null) return parsed;
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
      if (!parts.length || parts[0].indexOf('?') !== -1 || parts[0] === 'i') continue;
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

  async function waitForFirstSignal(timeoutMs) {
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      scrapeUserCells();
      if (collected.length > 0 || graphUsersReceived) return true;
      if (document.querySelector('[data-testid="UserCell"]')) return true;
      await sleep(500);
    }
    return collected.length > 0 || !!document.querySelector('[data-testid="UserCell"]');
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
    graphUsersReceived = false;
    var batchSize = options && options.batchSize ? options.batchSize : 500;
    var maxRounds = options && options.maxRounds ? options.maxRounds : 120;

    try {
      var ready = await waitForFirstSignal(15000);
      if (!ready) {
        window.postMessage({
          type: MSG_ERROR,
          message: 'Followers page did not load. Log into X, disable privacy blockers on x.com, and try again.',
        }, '*');
        return;
      }

      await sleep(1000);
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

      var profileFollowerCount = scrapeProfileFollowerCount();

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
        profileFollowerCount: profileFollowerCount,
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
      return;
    }
    if (event.data.type === MSG_GRAPH_USER && collecting) {
      var g = event.data;
      if (g.restId && g.username && isValidRestId(g.restId)) {
        if (upsertFollower({
          xUserId: String(g.restId),
          username: String(g.username),
          displayName: g.displayName,
          avatarUrl: g.avatarUrl,
          verified: g.verified,
        })) {
          graphUsersReceived = true;
        }
      }
    }
  });
})();
