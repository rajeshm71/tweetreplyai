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

  var LOG_PREFIX = '[TweetReply Followers][main]';
  function log(stage, message, data) {
    try {
      if (data !== undefined) console.log(LOG_PREFIX, stage + ':', message, data);
      else console.log(LOG_PREFIX, stage + ':', message);
    } catch (_e) {}
  }

  var collecting = false;
  var seenRestIds = {};
  var usernameToRestId = {};
  var collected = [];
  var graphUsersReceived = false;
  var graphIngestCount = 0;

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
      if (added > 0) {
        graphUsersReceived = true;
        graphIngestCount += added;
        log('graphql-ingest', 'Parsed users from response', { added: added, totalCollected: collected.length, url: url || '' });
      }
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

  function extractRestIdFromReactFiber(el) {
    if (!el) return null;
    var fiberKey = null;
    for (var k in el) {
      if (k.indexOf('__reactFiber') === 0 || k.indexOf('__reactInternalInstance') === 0) {
        fiberKey = k;
        break;
      }
    }
    if (!fiberKey) return null;
    var node = el[fiberKey];
    var hops = 0;
    while (node && hops < 45) {
      try {
        var props = node.memoizedProps || (node.stateNode && node.stateNode.props);
        if (props) {
          var candidates = [props.userId, props.user_id, props.rest_id, props.id_str, props.id];
          for (var c = 0; c < candidates.length; c++) {
            if (isValidRestId(candidates[c])) return String(candidates[c]).trim();
          }
          if (props.user && isValidRestId(props.user.rest_id)) return String(props.user.rest_id).trim();
          if (props.user && isValidRestId(props.user.id_str)) return String(props.user.id_str).trim();
        }
      } catch (_e) {}
      node = node.return;
      hops++;
    }
    return null;
  }

  function getUsernameFromCell(cell) {
    var userNameEl = cell.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      var atMatch = (userNameEl.textContent || '').match(/@([A-Za-z0-9_]+)/);
      if (atMatch) return atMatch[1];
      var profileLink = userNameEl.querySelector('a[href^="/"]');
      if (profileLink) {
        var profileHref = profileLink.getAttribute('href') || '';
        var profileParts = profileHref.split('/').filter(Boolean);
        if (profileParts[0] && profileParts[0] !== 'i') return profileParts[0];
      }
    }
    var links = cell.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      var parts = href.split('/').filter(Boolean);
      if (!parts.length || parts[0] === 'i' || parts[0].indexOf('?') !== -1) continue;
      if (parts.length === 1 || (parts.length === 2 && parts[1] === 'photo')) return parts[0];
    }
    return null;
  }

  function extractRestIdFromCell(cell) {
    var fromDom = extractRestIdFromCellDom(cell);
    if (fromDom) return fromDom;
    return extractRestIdFromReactFiber(cell);
  }

  function extractRestIdFromCellDom(cell) {
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
    var cellsWithoutId = 0;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var username = getUsernameFromCell(cell);
      if (!username) continue;
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
      } else {
        cellsWithoutId++;
      }
    }
    if (collecting && (enriched > 0 || cells.length > 0)) {
      log('dom-scrape', 'UserCell scrape', {
        cells: cells.length,
        enriched: enriched,
        cellsWithoutId: cellsWithoutId,
        totalCollected: collected.length,
      });
    }
    return enriched;
  }

  function forceRefreshList() {
    var container = getScrollContainer();
    if (container) container.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function getScrollContainer() {
    var cell = document.querySelector('[data-testid="UserCell"]');
    if (cell) {
      var el = cell.parentElement;
      while (el && el !== document.body) {
        try {
          var style = window.getComputedStyle(el);
          var overflowY = style.overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 40
          ) {
            return el;
          }
        } catch (_e) {}
        el = el.parentElement;
      }
    }
    return (
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('[role="dialog"]') ||
      document.scrollingElement ||
      document.documentElement
    );
  }

  function scrollFollowersViewport(container) {
    var cells = document.querySelectorAll('[data-testid="UserCell"]');
    var lastCell = cells.length ? cells[cells.length - 1] : null;
    if (lastCell) {
      try {
        lastCell.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'instant' });
      } catch (_e) {
        try {
          lastCell.scrollIntoView(false);
        } catch (_e2) {}
      }
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      try {
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
      } catch (_e) {}
    }
    window.scrollTo(0, document.body.scrollHeight);
    try {
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, bubbles: true, cancelable: true }));
    } catch (_e) {}
  }

  function computeMaxStaleRounds(targetCount) {
    if (targetCount > 500) return 40;
    if (targetCount > 200) return 30;
    if (targetCount > 100) return 22;
    return 12;
  }

  function computeMaxScrollRounds(targetCount) {
    if (targetCount > 500) return 200;
    if (targetCount > 200) return 150;
    return 120;
  }

  async function waitForFirstSignal(timeoutMs) {
    var start = Date.now();
    log('wait-signal', 'Waiting for followers page signal', { timeoutMs: timeoutMs });
    while (Date.now() - start < timeoutMs) {
      scrapeUserCells();
      if (collected.length > 0 || graphUsersReceived) {
        log('wait-signal', 'Ready — IDs collected', {
          collected: collected.length,
          graphUsersReceived: graphUsersReceived,
          elapsedMs: Date.now() - start,
        });
        return true;
      }
      if (document.querySelector('[data-testid="UserCell"]')) {
        log('wait-signal', 'Ready — UserCells visible (IDs pending)', {
          collected: collected.length,
          elapsedMs: Date.now() - start,
        });
        return true;
      }
      await sleep(500);
    }
    var hasCells = !!document.querySelector('[data-testid="UserCell"]');
    log('wait-signal', 'Timed out waiting for signal', {
      collected: collected.length,
      hasCells: hasCells,
      elapsedMs: Date.now() - start,
    });
    return collected.length > 0 || hasCells;
  }

  async function scrollFollowersList(maxRounds, targetCount) {
    var rounds = 0;
    var staleRounds = 0;
    var prevSize = collected.length;
    var maxStale = computeMaxStaleRounds(targetCount || collected.length);
    var target = targetCount > 0 ? targetCount : 0;
    var coverageGoal = target > 0 ? Math.max(50, Math.floor(target * 0.9)) : 0;

    log('scroll', 'Starting pagination scroll', {
      maxRounds: maxRounds,
      maxStale: maxStale,
      targetCount: target,
      coverageGoal: coverageGoal,
      initialCollected: collected.length,
    });

    while (collecting && rounds < maxRounds && staleRounds < maxStale) {
      var container = getScrollContainer();
      scrollFollowersViewport(container);
      await sleep(jitter(1500, 2800));
      scrapeUserCells();

      if (collected.length === prevSize) staleRounds++;
      else staleRounds = 0;
      prevSize = collected.length;
      rounds++;

      if (rounds === 1 || rounds % 10 === 0 || staleRounds >= maxStale - 2) {
        log('scroll', 'Scroll round', {
          round: rounds,
          collected: collected.length,
          staleRounds: staleRounds,
          maxStale: maxStale,
          userCellsVisible: document.querySelectorAll('[data-testid="UserCell"]').length,
        });
      }

      if (coverageGoal > 0 && collected.length >= coverageGoal) {
        log('scroll', 'Coverage goal reached', { collected: collected.length, coverageGoal: coverageGoal });
        break;
      }

      window.postMessage({
        type: MSG_BATCH,
        progress: { collected: collected.length, round: rounds },
        followers: [],
        partial: true,
      }, '*');
    }

    log('scroll', 'Scroll complete', {
      rounds: rounds,
      collected: collected.length,
      staleRounds: staleRounds,
      targetCount: target,
      reason: staleRounds >= maxStale ? 'stale' : rounds >= maxRounds ? 'maxRounds' : 'coverageGoal',
    });
  }

  async function runSync(options) {
    if (collecting) {
      log('sync-start', 'Skipped — sync already running');
      return;
    }
    collecting = true;
    seenRestIds = {};
    usernameToRestId = {};
    collected = [];
    graphUsersReceived = false;
    graphIngestCount = 0;
    var batchSize = options && options.batchSize ? options.batchSize : 500;
    var profileFollowerCount = scrapeProfileFollowerCount();
    var computedMaxRounds = computeMaxScrollRounds(profileFollowerCount || 0);
    var maxRounds = Math.max(computedMaxRounds, (options && options.maxRounds) || 0);

    log('sync-start', 'Collection started', {
      path: location.pathname,
      batchSize: batchSize,
      maxRounds: maxRounds,
      profileFollowerCount: profileFollowerCount,
    });

    try {
      // Allow interceptor to replay GraphQL users captured before collecting started.
      await sleep(200);
      scrapeUserCells();
      log('replay-wait', 'After buffer replay wait', { collected: collected.length });

      forceRefreshList();
      log('force-refresh', 'Scrolled list to top');
      await sleep(1200);
      scrapeUserCells();

      var ready = await waitForFirstSignal(15000);
      if (!ready) {
        log('sync-error', 'Followers page did not load');
        window.postMessage({
          type: MSG_ERROR,
          message: 'Followers page did not load. Log into X, disable privacy blockers on x.com, and try again.',
        }, '*');
        return;
      }

      await sleep(1000);
      scrapeUserCells();
      await scrollFollowersList(maxRounds, profileFollowerCount || 0);
      scrapeUserCells();

      if (!collected.length) {
        log('sync-error', 'No stable IDs collected', {
          userCells: document.querySelectorAll('[data-testid="UserCell"]').length,
          graphIngestCount: graphIngestCount,
          graphUsersReceived: graphUsersReceived,
        });
        window.postMessage({
          type: MSG_ERROR,
          message: 'No followers with stable IDs were collected. Stay on your followers page and try again.',
        }, '*');
        return;
      }

      if (!profileFollowerCount) profileFollowerCount = scrapeProfileFollowerCount();
      var coveragePct =
        profileFollowerCount > 0 ? Math.round((collected.length / profileFollowerCount) * 100) : null;
      log('collection-done', 'Followers collected', {
        collected: collected.length,
        profileFollowerCount: profileFollowerCount,
        coveragePct: coveragePct,
        graphIngestCount: graphIngestCount,
      });

      if (profileFollowerCount > 0 && collected.length < profileFollowerCount * 0.5) {
        log('collection-warn', 'Low coverage — scroll may not have paginated fully', {
          collected: collected.length,
          profileFollowerCount: profileFollowerCount,
          coveragePct: coveragePct,
        });
      }

      var batchCount = 0;
      for (var i = 0; i < collected.length; i += batchSize) {
        batchCount++;
        log('batch-post', 'Posting batch to bridge', {
          batch: batchCount,
          size: Math.min(batchSize, collected.length - i),
          total: collected.length,
        });
        window.postMessage({
          type: MSG_BATCH,
          progress: { collected: collected.length, uploaded: Math.min(i + batchSize, collected.length) },
          followers: collected.slice(i, i + batchSize),
          partial: i + batchSize < collected.length,
        }, '*');
      }

      log('sync-done', 'Collection complete, finalizing', {
        total: collected.length,
        profileFollowerCount: profileFollowerCount,
        batches: batchCount,
      });
      window.postMessage({
        type: MSG_DONE,
        total: collected.length,
        profileFollowerCount: profileFollowerCount,
        followers: collected,
      }, '*');
    } catch (err) {
      log('sync-error', 'Unexpected error', { error: err && err.message ? err.message : String(err) });
      window.postMessage({
        type: MSG_ERROR,
        message: err && err.message ? err.message : 'Follower sync failed',
      }, '*');
    } finally {
      collecting = false;
      log('sync-end', 'Collection stopped');
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.type === MSG_START) {
      log('message', 'Received TRAI_FOLLOWER_SYNC_START');
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
          if (collected.length === 1 || collected.length % 25 === 0) {
            log('graph-user', 'Ingested from interceptor', { totalCollected: collected.length, latest: '@' + g.username });
          }
        }
      }
    }
  });
})();

