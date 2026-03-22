/**
 * document_start (isolated world). Injects page-world follow-network-interceptor.js.
 */
(function () {
  if (window.__TWEETREPLY_FOLLOW_LOADER__) return;
  window.__TWEETREPLY_FOLLOW_LOADER__ = true;
  try {
    var src = chrome.runtime.getURL('content/follow-network-interceptor.js');
    var s = document.createElement('script');
    s.src = src;
    s.type = 'text/javascript';
    s.setAttribute('data-tweetreply', 'follow-network-interceptor');
    var root = document.head || document.documentElement;
    root.insertBefore(s, root.firstChild);
  } catch (e) {
    console.warn('[TweetReply] follow-interceptor-loader:', e);
  }
})();
