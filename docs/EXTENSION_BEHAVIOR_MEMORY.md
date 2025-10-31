# TweetReply – Behavior Memory (What change fixed what)

This document captures the proven changes and the specific behaviors they enable. Use this as the canonical reference when maintaining or extending the extension.

## 1) Hide UI on Post composer (works reliably)

Code: `extension/content/content.js` → `isMainComposer(containerEl)`

Rules that mark a container as the main Post composer:
- Textarea hint contains "What’s happening?", or
- Container has a Post/Tweet primary button and does not have a Reply button, or
- The global inline button text is "Post" AND the container is not inside a dialog/article.
- Additionally, aria "Post text" counts as Post only when NOT inside a dialog/article (prevents false positives on reply modals and tweet detail).

Impact:
- Prevents Suggest/Dropdowns from showing on the main tweet composer.

## 2) Always show on Tweet Detail and Inline (fixed)

Changes:
- Removed earlier page‑level blocker that hid UI whenever the global inline button text was "Post".
- Composer context is derived from the container using `getComposerContext` + `isReplyComposer` (container‑level, not page‑level).

Impact:
- Suggest and dropdowns appear on Tweet Detail even if the global inline button shows "Post".
- Inline reply appears without refresh.

## 3) Keep Suggest glued left of Reply (stable)

Code: `ensureSuggestLeftOfReply(toolbarEl, controlsRow, containerEl)`

Mechanism:
- Performs initial placement with `placeSuggestButtonLeftOfReply`.
- MutationObserver on the toolbar subtree re‑places after DOM updates (rerenders).
- Throttled listeners on `focusin`, `input`, and `keyup` on the composer container re‑place during typing/focus.
- Idempotent move: only relocates when not already directly before Reply.

Impact:
- Suggest stays immediately to the left of the native Reply button across focus/typing/rerenders.

## 4) Dropdown row anchored above toolbar (consistent)

Change:
- Insert the dropdown row immediately before the native toolbar and apply a fixed flex layout:
  - `display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0 6px;`

Impact:
- Dropdowns retain a consistent position across Tweet Detail and Inline reply.

## 5) SPA/Timing resilience (discovery without refresh)

Code: `startObserving` → `checkForReplyComposers`

Mechanism:
- A document‑level MutationObserver debounces DOM changes and scans for newly added composers (e.g., inline reply modal opening).

Impact:
- Suggest/Dropdowns are injected as soon as a composer mounts, without page refresh.

---

### Key functions
- `isMainComposer`, `isReplyComposer`, `getComposerContext`
- `placeSuggestButtonLeftOfReply`, `ensureSuggestLeftOfReply`, `observePlacement`
- `createSuggestButton`
- `startObserving`, `checkForReplyComposers`

These together solved: visibility on Tweet Detail/Inline, suppression on Post composer, and stable placement next to Reply.


