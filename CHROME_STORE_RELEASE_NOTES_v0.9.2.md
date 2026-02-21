# Chrome Web Store Submission - v0.9.2

## Release Notes (for Chrome Web Store)

### Version 0.9.2
- **Fixed:** Suggest Reply button now reliably appears on Tweet Detail pages
- **Fixed:** Suggest Reply button stays correctly positioned next to Reply button even when clicking/typing
- **Fixed:** Extension now properly hides from main Post composer (prevents showing on "What's happening?" composer)
- **Improved:** Better composer detection to handle inline reply modals without page refresh
- **Improved:** Sticky placement system keeps Suggest button aligned with Reply button across page rerenders

---

## What's Changed Since v0.9.1
- Enhanced composer detection logic for more accurate UI injection
- Added MutationObserver-based placement system for stable button positioning
- Improved guard logic to distinguish between Post composers and Reply composers
- Fixed regression where inline replies weren't showing Suggest Reply feature

---

## Store Listing Details

### Short Description
Generate authentic, AI-powered replies to Twitter/X posts with one click.

### Full Description
TweetReply uses advanced AI to help you craft engaging, human-like replies to tweets instantly. Simply click "Suggest Reply" while replying to any tweet, and our AI will generate contextual, authentic responses that match your communication style. Perfect for professionals, content creators, and anyone who wants to maintain an active social media presence without spending hours crafting responses.

**Features:**
- One-click AI reply generation
- Multiple AI models for best results
- Various reply styles (Direct, Professional, Casual, etc.)
- Smart text replacement that works seamlessly with Twitter's interface
- Quality scoring for generated replies
- Usage tracking and quota management

**Privacy-First:** Your data is processed securely and never stored without your consent.

---

## Submission Checklist

### ✅ Package Ready
- [x] Version bumped to 0.9.2
- [x] Zip file created: `tweetreply-extension-v0.9.2-chrome-store.zip`
- [x] All files included in correct structure

### 📋 Store Listing
- [ ] Title: "TweetReply - AI-Powered Twitter Replies"
- [ ] Short description: (use text above)
- [ ] Full description: (use text above)
- [ ] Category: Productivity or Social & Communication
- [ ] Language: English
- [ ] Screenshots uploaded (1280x800 recommended)
- [ ] Icon uploaded (128x128 PNG)

### 🔒 Privacy Practices
- [ ] activeTab permission justified
- [ ] host_permissions (twitter.com, x.com) justified
- [ ] scripting permission justified
- [ ] storage permission justified
- [ ] Single purpose description provided
- [ ] Data usage compliance certified
- [ ] Privacy Policy URL provided (your privacy-policy.html hosted publicly)

### 📝 Versions Tab
- [ ] Release notes added (use text above)
- [ ] Version number: 0.9.2

### 🌍 Distribution
- [ ] Visibility set (Public/Unlisted/Private)
- [ ] Regions selected
- [ ] Submit for review

---

## Quick Submission Steps

1. **Go to:** https://chrome.google.com/webstore/devconsole/
2. **Click your extension** (TweetReply)
3. **Upload New Package:**
   - Go to "Package" tab (or click existing package)
   - Click "Upload new package"
   - Select: `tweetreply-extension-v0.9.2-chrome-store.zip`
4. **Complete Required Fields:**
   - Store listing tab: Fill title, descriptions, screenshots
   - Privacy practices: Justify all permissions
   - Versions: Add release notes (from above)
5. **Submit for Review:** Click "Submit for review" button

---

## Permission Justifications (Copy-Paste Ready)

### activeTab Permission
```
This permission allows the extension to access the currently active Twitter/X tab only when the user explicitly clicks the extension icon to generate AI-powered reply suggestions. The extension only accesses tab content when the user actively requests it, ensuring minimal privacy impact.
```

### Host Permissions (twitter.com, x.com)
```
These permissions are required to inject content scripts into Twitter/X pages so users can generate AI reply suggestions directly within Twitter's reply interface. The extension only accesses content when the user clicks the "Suggest Reply" button.
```

### Scripting Permission
```
This permission enables the extension to inject content scripts into Twitter/X pages to add the "Suggest Reply" button and functionality. Only used when user actively requests reply generation.
```

### Storage Permission
```
This permission is used to store user authentication tokens, usage data, and user preferences locally. No data is transmitted to third parties. All storage is local to the user's browser.
```

---

## Next Steps After Upload

1. Wait for Chrome's automated validation (usually instant)
2. Complete any missing required fields
3. Submit for review
4. Review typically takes 1-3 days (first submission may take longer)
5. Once approved, your extension will be live!

