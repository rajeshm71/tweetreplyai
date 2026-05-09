/**
 * Page-world script (Main world). Registered as MV3 content script world MAIN @ document_start,
 * or legacy: loaded via chrome-extension:// URL (deprecated path).
 * Intercepts X GraphQL JSON for follow relationship fields.
 */
(function () {
  if (window.__TWEETREPLY_FOLLOW_INTERCEPTOR__) return;
  window.__TWEETREPLY_FOLLOW_INTERCEPTOR__ = true;

  var MSG_STATUS = 'TWEETREPLY_FOLLOW_STATUS';
  var MSG_BUFFER_REPLAY = 'TWEETREPLY_REQUEST_BUFFER_REPLAY';

  var globalFollowCache = {};
  var followStatusBuffer = [];
  var BUFFER_MAX_SIZE = 200;

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

  function sendFollowStatusMessage(message) {
    followStatusBuffer.push(message);
    if (followStatusBuffer.length > BUFFER_MAX_SIZE) followStatusBuffer.shift();
    window.postMessage(message, '*');
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.type !== MSG_BUFFER_REPLAY) return;
    for (var i = 0; i < followStatusBuffer.length; i++) {
      window.postMessage(followStatusBuffer[i], '*');
    }
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
        following: following,
        followedBy: followedBy,
        hasRelationshipData: hasRelationshipData,
      });
    } else if (obj.rest_id && obj.legacy && obj.legacy.screen_name) {
      var hasLegacyRelationship =
        obj.legacy.following !== undefined || obj.legacy.followed_by !== undefined;
      users.push({
        username: obj.legacy.screen_name,
        restId: obj.rest_id,
        following: !!obj.legacy.following,
        followedBy: !!obj.legacy.followed_by,
        hasRelationshipData: hasLegacyRelationship,
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

  function processResponse(url, text) {
    try {
      var data = JSON.parse(text);
      var users = [];
      findUsers(data, users, 0);

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
          if (cachedStatus) {
            var cachedIsFollowing = cachedStatus.following;
            var newIsFollowing = u2.following;
            if (cachedIsFollowing && !newIsFollowing) continue;
          }

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
