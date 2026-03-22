/**
 * Page-world script (Main world). Loaded via chrome-extension:// URL.
 * Intercepts X GraphQL/REST JSON for follow relationship fields.
 */
(function () {
  if (window.__TWEETREPLY_FOLLOW_INTERCEPTOR__) return;
  window.__TWEETREPLY_FOLLOW_INTERCEPTOR__ = true;

  var MSG_STATUS = 'TWEETREPLY_FOLLOW_STATUS';
  var MSG_BUFFER_REPLAY = 'TWEETREPLY_REQUEST_BUFFER_REPLAY';

  var globalFollowCache = {};
  var followStatusBuffer = [];
  var BUFFER_MAX_SIZE = 200;

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

  function shouldIntercept(url) {
    if (!url || typeof url !== 'string') return false;
    for (var i = 0; i < INTERCEPT_PATTERNS.length; i++) {
      if (url.indexOf(INTERCEPT_PATTERNS[i]) !== -1) return true;
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
    var url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url ? args[0].url : '';
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
    this._tweetreplyUrl = url ? url.toString() : '';
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener(
      'load',
      function () {
        try {
          if (xhr._tweetreplyUrl && shouldIntercept(xhr._tweetreplyUrl) && xhr.responseText) {
            processResponse(xhr._tweetreplyUrl, xhr.responseText);
          }
        } catch (_e) {}
      },
      { once: true }
    );
    return originalXHRSend.apply(this, arguments);
  };
})();
