/**
 * Page-world script (Main world). Registered as MV3 content script world MAIN @ document_start,
 * or legacy: loaded via chrome-extension:// URL (deprecated path).
 * Intercepts X GraphQL JSON for follow relationship fields.
 */
(function () {
  if (window.__TWEETREPLY_FOLLOW_INTERCEPTOR__) return;
  window.__TWEETREPLY_FOLLOW_INTERCEPTOR__ = true;

  var MSG_STATUS = 'TWEETREPLY_FOLLOW_STATUS';
  var MSG_USER_STATS = 'TWEETREPLY_USER_STATS';
  var MSG_FOLLOWER_GRAPH = 'TRAI_FOLLOWER_GRAPH_USER';
  var MSG_BUFFER_REPLAY = 'TWEETREPLY_REQUEST_BUFFER_REPLAY';
  var MSG_USER_STATS_REPLAY = 'TWEETREPLY_REQUEST_USER_STATS_REPLAY';

  var globalFollowCache = {};
  var followStatusBuffer = [];
  var userStatsBuffer = [];
  var followerGraphUserBuffer = [];
  var FOLLOWER_GRAPH_BUFFER_MAX = 5000;
  var BUFFER_MAX_SIZE = 200;
  var LOG_PREFIX = '[TweetReply Followers][interceptor]';

  function log(stage, message, data) {
    try {
      if (data !== undefined) console.log(LOG_PREFIX, stage + ':', message, data);
      else console.log(LOG_PREFIX, stage + ':', message);
    } catch (_e) {}
  }

  /**
   * Substrings of GraphQL operation paths (see Network tab on x.com). Update when X renames routes.
   * Last reviewed: 2025-03 — HomeTimeline, TweetDetail, UserBy*, etc.
   */
  var INTERCEPT_PATTERNS = [
    '/UserByScreenName',
    '/UserByRestId',
    '/UsersByRestIds',
    '/HomeTimeline',
    '/HomeLatestTimeline',
    '/TweetDetail',
    '/Followers',
    '/BlueVerifiedFollowers',
    '/FollowersYouKnow',
    '/Following',
    '/UserTweets',
    '/ListLatestTweetsTimeline',
    '/SearchTimeline',
    '/ProfileSpotlightsQuery',
    '/CommunityTweetsTimeline',
    '/NotificationsTimeline',
  ];

  function normalizeUrlString(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      return new URL(url, location.href).href;
    } catch (_e) {
      return url;
    }
  }

  /** Resolve fetch() first argument to an absolute URL string for pattern matching. */
  function normalizeFetchInput(input) {
    if (typeof input === 'string') {
      return normalizeUrlString(input);
    }
    if (typeof URL !== 'undefined' && input instanceof URL) {
      return normalizeUrlString(input.href);
    }
    if (input && typeof input === 'object') {
      var u = input.url;
      if (typeof u === 'string') return normalizeUrlString(u);
    }
    return '';
  }

  function shouldIntercept(url) {
    if (!url || typeof url !== 'string') return false;
    var abs = normalizeUrlString(url);
    for (var i = 0; i < INTERCEPT_PATTERNS.length; i++) {
      if (abs.indexOf(INTERCEPT_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function isFollowerListUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var abs = normalizeUrlString(url);
    return (
      abs.indexOf('/Followers') !== -1 ||
      abs.indexOf('/BlueVerifiedFollowers') !== -1 ||
      abs.indexOf('/FollowersYouKnow') !== -1 ||
      abs.indexOf('/Following') !== -1
    );
  }

  function sendFollowStatusMessage(message) {
    followStatusBuffer.push(message);
    if (followStatusBuffer.length > BUFFER_MAX_SIZE) followStatusBuffer.shift();
    window.postMessage(message, '*');
  }

  function coerceFollowerField(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
    if (typeof raw === 'string' && raw.trim()) {
      var cleaned = raw.replace(/,/g, '').trim();
      var match = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
      if (match) {
        var num = parseFloat(match[1]);
        if (Number.isFinite(num)) {
          var mult = { K: 1000, M: 1000000, B: 1000000000 };
          var suffix = match[2] ? match[2].toUpperCase() : '';
          return Math.round(num * (mult[suffix] || 1));
        }
      }
      var asInt = parseInt(cleaned, 10);
      if (Number.isFinite(asInt) && asInt >= 0) return asInt;
    }
    return undefined;
  }

  function followerCountFromLegacy(legacy) {
    if (!legacy) return undefined;
    return (
      coerceFollowerField(legacy.followers_count) ??
      coerceFollowerField(legacy.normal_followers_count)
    );
  }

  function sendUserStatsMessage(message) {
    userStatsBuffer.push(message);
    if (userStatsBuffer.length > BUFFER_MAX_SIZE) userStatsBuffer.shift();
    window.postMessage(message, '*');
  }

  function bufferFollowerGraphUser(user) {
    if (!user.restId || !user.username || !/^\d+$/.test(String(user.restId))) return;
    var restId = String(user.restId);
    for (var i = 0; i < followerGraphUserBuffer.length; i++) {
      if (followerGraphUserBuffer[i].restId === restId) {
        followerGraphUserBuffer[i] = user;
        return;
      }
    }
    followerGraphUserBuffer.push(user);
    if (followerGraphUserBuffer.length > FOLLOWER_GRAPH_BUFFER_MAX) {
      followerGraphUserBuffer.shift();
    }
    if (followerGraphUserBuffer.length === 1 || followerGraphUserBuffer.length % 50 === 0) {
      log('buffer', 'Buffered follower graph user', {
        bufferSize: followerGraphUserBuffer.length,
        latest: '@' + user.username,
      });
    }
  }

  function replayFollowerGraphBuffer() {
    log('buffer-replay', 'Replaying buffered graph users', { count: followerGraphUserBuffer.length });
    for (var i = 0; i < followerGraphUserBuffer.length; i++) {
      var u = followerGraphUserBuffer[i];
      window.postMessage({
        type: MSG_FOLLOWER_GRAPH,
        restId: u.restId,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        verified: false,
      }, '*');
    }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.type !== MSG_BUFFER_REPLAY) return;
    for (var i = 0; i < followStatusBuffer.length; i++) {
      window.postMessage(followStatusBuffer[i], '*');
    }
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.type !== MSG_USER_STATS_REPLAY) return;
    for (var s = 0; s < userStatsBuffer.length; s++) {
      window.postMessage(userStatsBuffer[s], '*');
    }
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.type !== 'TRAI_FOLLOWER_SYNC_START') return;
    // Defer so follower-sync-main can set collecting=true first.
    setTimeout(replayFollowerGraphBuffer, 0);
  });

  // React fiber text insertion — runs in MAIN world so __reactFiber$ keys are accessible.
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.type !== 'TRAI_INSERT_TEXT') return;
    var markerId = event.data.markerId;
    var text = event.data.text;

    var textArea = document.querySelector('[data-trai-marker="' + markerId + '"]');
    if (!textArea) {
      window.postMessage({ type: 'TRAI_INSERT_TEXT_RESULT', markerId: markerId, success: false, reason: 'not_found' }, '*');
      return;
    }

    var fiberKey = null;
    for (var k in textArea) {
      if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
        fiberKey = k;
        break;
      }
    }
    var fiber = fiberKey ? textArea[fiberKey] : (textArea._reactInternalFiber || textArea._reactInternalInstance || null);

    if (!fiber) {
      window.postMessage({ type: 'TRAI_INSERT_TEXT_RESULT', markerId: markerId, success: false, reason: 'no_fiber' }, '*');
      return;
    }

    var node = fiber;
    var hops = 0;
    var success = false;

    while (node && hops < 50) {
      try {
        var p = node.memoizedProps;
        if (p && p.editorState && typeof p.editorState.getCurrentContent === 'function' && typeof p.onChange === 'function') {
          var es = p.editorState;
          var CS = es.getCurrentContent().constructor;
          var ES = es.constructor;
          var newCS = CS.createFromText(text);
          var newES = ES.createWithContent(newCS);
          try { newES = ES.moveFocusToEnd(newES); } catch (e) {}
          p.onChange(newES);
          success = true;
          break;
        }
        var sp = node.stateNode && node.stateNode.props;
        if (sp && sp.editorState && typeof sp.editorState.getCurrentContent === 'function' && typeof sp.onChange === 'function') {
          var es2 = sp.editorState;
          var CS2 = es2.getCurrentContent().constructor;
          var ES2 = es2.constructor;
          var newCS2 = CS2.createFromText(text);
          var newES2 = ES2.createWithContent(newCS2);
          try { newES2 = ES2.moveFocusToEnd(newES2); } catch (e) {}
          sp.onChange(newES2);
          success = true;
          break;
        }
      } catch (e) { /* skip bad nodes */ }
      node = node.return;
      hops++;
    }

    window.postMessage({ type: 'TRAI_INSERT_TEXT_RESULT', markerId: markerId, success: success, hops: hops }, '*');
  });

  function findUsers(obj, users, depth) {
    if (depth > 25 || !obj || typeof obj !== 'object') return;

    if (obj.rest_id && obj.core && obj.core.screen_name) {
      var following = false;
      var followedBy = false;
      var hasRelationshipData = false;

      if (obj.relationship_perspectives) {
        following = !!obj.relationship_perspectives.following;
        followedBy = !!obj.relationship_perspectives.followed_by;
        hasRelationshipData = true;
      }
      if (obj.legacy) {
        if (obj.legacy.following !== undefined) {
          following = !!obj.legacy.following;
          hasRelationshipData = true;
        }
        if (obj.legacy.followed_by !== undefined) {
          followedBy = !!obj.legacy.followed_by;
          hasRelationshipData = true;
        }
      }

      users.push({
        username: obj.core.screen_name,
        restId: obj.rest_id,
        displayName: obj.core.name ? String(obj.core.name) : undefined,
        avatarUrl: obj.avatar && obj.avatar.image_url ? String(obj.avatar.image_url) : undefined,
        following: following,
        followedBy: followedBy,
        hasRelationshipData: hasRelationshipData,
        followerCount: followerCountFromLegacy(obj.legacy),
      });
    } else if (obj.rest_id && obj.legacy && obj.legacy.screen_name) {
      var hasLegacyRelationship =
        obj.legacy.following !== undefined || obj.legacy.followed_by !== undefined;
      users.push({
        username: obj.legacy.screen_name,
        restId: obj.rest_id,
        displayName: obj.legacy.name ? String(obj.legacy.name) : undefined,
        avatarUrl: obj.legacy.profile_image_url_https ? String(obj.legacy.profile_image_url_https) : undefined,
        following: !!obj.legacy.following,
        followedBy: !!obj.legacy.followed_by,
        hasRelationshipData: hasLegacyRelationship,
        followerCount: followerCountFromLegacy(obj.legacy),
      });
    } else if (obj.screen_name && (obj.id_str || obj.id)) {
      users.push({
        username: obj.screen_name,
        restId: obj.id_str || obj.id,
        following: !!obj.following,
        followedBy: !!obj.followed_by,
        hasRelationshipData: true,
      });
    }

    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) findUsers(obj[i], users, depth + 1);
    } else {
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) findUsers(obj[keys[j]], users, depth + 1);
    }
  }

  function isFollowerTimelineEntry(entry) {
    if (!entry || typeof entry !== 'object') return false;
    var entryId = typeof entry.entryId === 'string' ? entry.entryId : '';
    if (entryId.indexOf('user-') !== 0) return false;
    var content = entry.content;
    if (!content || typeof content !== 'object') return false;
    var itemContent = content.itemContent;
    if (!itemContent || typeof itemContent !== 'object') return false;
    if (itemContent.itemType && itemContent.itemType !== 'TimelineUser') return false;
    if (itemContent.__typename && itemContent.__typename !== 'TimelineUser') return false;
    return true;
  }

  function userFromTimelineResult(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.__typename === 'UserUnavailable') return null;
    var restId = result.rest_id;
    if (!restId || !/^\d+$/.test(String(restId))) return null;
    var core = result.core;
    var legacy = result.legacy;
    var avatar = result.avatar;
    var username = (core && core.screen_name) || (legacy && legacy.screen_name);
    if (!username) return null;
    return {
      restId: String(restId),
      username: String(username),
      displayName: (core && core.name) || (legacy && legacy.name) || undefined,
      avatarUrl:
        (avatar && avatar.image_url) ||
        (legacy && legacy.profile_image_url_https) ||
        undefined,
    };
  }

  function extractFollowerEntryUsers(data) {
    var users = [];
    if (!data || typeof data !== 'object') return users;

    function walk(obj, depth) {
      if (depth > 30 || !obj || typeof obj !== 'object') return;
      if (obj.instructions && Array.isArray(obj.instructions)) {
        for (var i = 0; i < obj.instructions.length; i++) {
          var inst = obj.instructions[i];
          if (inst.entries && Array.isArray(inst.entries)) {
            for (var j = 0; j < inst.entries.length; j++) {
              var entry = inst.entries[j];
              if (!isFollowerTimelineEntry(entry)) continue;
              var userResults = entry.content.itemContent.user_results;
              var user = userFromTimelineResult(userResults && userResults.result);
              if (user) users.push(user);
            }
          }
        }
      }
      if (Array.isArray(obj)) {
        for (var a = 0; a < obj.length; a++) walk(obj[a], depth + 1);
      } else {
        var keys = Object.keys(obj);
        for (var b = 0; b < keys.length; b++) walk(obj[keys[b]], depth + 1);
      }
    }

    walk(data, 0);
    return users;
  }

  function processResponse(url, text) {
    try {
      var data = JSON.parse(text);
      var users = [];
      findUsers(data, users, 0);
      var fromFollowerList = isFollowerListUrl(url);
      if (fromFollowerList) {
        log('graphql-response', 'Follower-list response', { url: url.slice(0, 120), usersFound: users.length });
      }

      var userMap = {};
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        if (!u.username) continue;
        var key = u.username.toLowerCase();
        var existing = userMap[key];
        if (!existing) {
          userMap[key] = u;
        } else {
          if (u.hasRelationshipData && !existing.hasRelationshipData) userMap[key] = u;
          else if (
            u.hasRelationshipData &&
            existing.hasRelationshipData &&
            u.following &&
            !existing.following
          ) {
            userMap[key] = u;
          } else if (typeof u.followerCount === 'number' && typeof existing.followerCount !== 'number') {
            userMap[key] = Object.assign({}, existing, u);
          }
        }
      }

      var deduplicatedUsers = [];
      var mapKeys = Object.keys(userMap);
      for (var j = 0; j < mapKeys.length; j++) deduplicatedUsers.push(userMap[mapKeys[j]]);
      users = deduplicatedUsers;

      var seenUsernames = {};
      for (var k = 0; k < users.length; k++) {
        var u2 = users[k];
        if (!u2.username) continue;
        var normalizedUsername = u2.username.toLowerCase();
        if (seenUsernames[normalizedUsername]) continue;
        seenUsernames[normalizedUsername] = true;

        if (u2.hasRelationshipData) {
          var cachedStatus = globalFollowCache[normalizedUsername];
          var skipFollowStatus = false;
          if (cachedStatus) {
            var cachedIsFollowing = cachedStatus.following;
            var newIsFollowing = u2.following;
            // Review fix: skip follow-status only — follower stats must still emit below
            if (cachedIsFollowing && !newIsFollowing) skipFollowStatus = true;
          }

          if (!skipFollowStatus) {
            globalFollowCache[normalizedUsername] = {
              following: u2.following,
              followedBy: u2.followedBy,
            };

            sendFollowStatusMessage({
              type: MSG_STATUS,
              username: normalizedUsername,
              xUserId: u2.restId || null,
              followedBy: u2.followedBy,
              following: u2.following,
              hasRelationshipData: true,
            });
          }
        }

        if (typeof u2.followerCount === 'number' && u2.followerCount >= 0) {
          sendUserStatsMessage({
            type: MSG_USER_STATS,
            username: normalizedUsername,
            followerCount: u2.followerCount,
            restId: u2.restId || null,
          });
        }
      }

      // Strict follower-list emission: only users that appear as TimelineUser entries
      // in /Followers responses become candidate followers. This rejects suggestion
      // modules, embedded tweet authors, and other nested user references.
      if (fromFollowerList) {
        var followerEntryUsers = extractFollowerEntryUsers(data);
        var seenEmit = {};
        var emittedGraphUsers = 0;
        for (var e = 0; e < followerEntryUsers.length; e++) {
          var fu = followerEntryUsers[e];
          if (!fu || !fu.restId || seenEmit[fu.restId]) continue;
          seenEmit[fu.restId] = true;
          bufferFollowerGraphUser(fu);
          window.postMessage({
            type: MSG_FOLLOWER_GRAPH,
            restId: fu.restId,
            username: fu.username,
            displayName: fu.displayName,
            avatarUrl: fu.avatarUrl,
            verified: false,
          }, '*');
          emittedGraphUsers++;
        }
        if (emittedGraphUsers > 0) {
          log('graphql-emit', 'Emitted graph users from follower list', { emitted: emittedGraphUsers });
        }
      }
    } catch (_e) {
      /* ignore */
    }
  }

  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = normalizeFetchInput(args[0]);
    return originalFetch.apply(this, args).then(function (response) {
      if (shouldIntercept(url)) {
        response
          .clone()
          .text()
          .then(function (text) {
            processResponse(url, text);
          })
          .catch(function () {});
      }
      return response;
    });
  };

  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    var u = url;
    this._tweetreplyUrl = u != null ? normalizeUrlString(String(u)) : '';
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener(
      'load',
      function () {
        try {
          var u = xhr._tweetreplyUrl || '';
          if (xhr.responseText && shouldIntercept(u)) {
            processResponse(u, xhr.responseText);
          }
        } catch (_e) {}
      },
      { once: true }
    );
    return originalXHRSend.apply(this, arguments);
  };
})();
