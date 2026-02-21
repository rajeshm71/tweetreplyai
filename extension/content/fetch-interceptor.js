(function () {
  const origFetch = window.fetch;
  const CACHE_EVENT = '__tweetreply_tweets';
  const MAX_DEPTH = 30;

  function extractTweets(obj, results, depth) {
    if (!obj || typeof obj !== 'object' || depth > MAX_DEPTH) return;
    if (obj.rest_id && obj.legacy && typeof obj.legacy.full_text === 'string') {
      const screenName =
        obj.core?.user_results?.result?.legacy?.screen_name || '';
      results.push({
        id: String(obj.rest_id),
        text: obj.legacy.full_text,
        author: screenName,
        inReplyToStatusId: obj.legacy.in_reply_to_status_id_str || null,
        conversationId: obj.legacy.conversation_id_str || null,
      });
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          extractTweets(val[i], results, depth + 1);
        }
      } else if (val && typeof val === 'object') {
        extractTweets(val, results, depth + 1);
      }
    }
  }

  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const url =
        (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
      if (url.includes('/i/api/') || url.includes('/graphql/')) {
        const clone = response.clone();
        clone
          .json()
          .then(function (json) {
            const tweets = [];
            extractTweets(json, tweets, 0);
            if (tweets.length > 0) {
              console.log('[TweetReply] Interceptor: captured', tweets.length, 'tweets from API');
              var dataEl = document.getElementById('__tweetreply_data');
              if (!dataEl) {
                dataEl = document.createElement('script');
                dataEl.id = '__tweetreply_data';
                dataEl.type = 'application/json';
                dataEl.textContent = '[]';
                (document.head || document.documentElement).appendChild(dataEl);
              }
              try {
                var existing = JSON.parse(dataEl.textContent || '[]');
                existing.push.apply(existing, tweets);
                if (existing.length > 500) existing.splice(0, existing.length - 500);
                dataEl.textContent = JSON.stringify(existing);
              } catch (e) {}
              window.postMessage({ type: CACHE_EVENT, tweets: tweets }, '*');
            }
          })
          .catch(function () {});
      }
    } catch (_e) {}
    return response;
  };
})();
