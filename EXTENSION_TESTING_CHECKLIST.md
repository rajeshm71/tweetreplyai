# Chrome Extension Testing Checklist

## Pre-Testing Setup

### 1. Load Extension in Chrome
1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `extension-build` folder
6. Verify extension appears in the list with version 0.9.0
7. Check that no errors appear in the extension details

### 2. Verify Extension Installation
- [ ] Extension icon appears in Chrome toolbar
- [ ] Extension shows as enabled in chrome://extensions/
- [ ] No console errors in extension details page
- [ ] Service worker is running (check chrome://serviceworker-internals/)

## Authentication Flow Testing

### 3. Test Extension Popup
1. Click the extension icon in toolbar
2. Verify popup opens correctly
3. Check that all UI elements are visible and properly styled
4. Verify no JavaScript errors in popup console

### 4. Test Sign In Flow
1. Click "Sign In" button in popup
2. Verify redirects to web app (https://tweetreplyai.vercel.app)
3. Complete Google OAuth login
4. Verify redirect back to extension or web app
5. Check that extension popup shows authenticated state
6. Verify usage stats are displayed

### 5. Test Authentication Persistence
1. Close browser completely
2. Reopen browser
3. Click extension icon
4. Verify still authenticated (no sign-in required)
5. Check that usage stats are still displayed

## Content Script Testing

### 6. Test Content Script Injection
1. Navigate to https://twitter.com
2. Open browser DevTools (F12)
3. Check Console tab for any errors
4. Verify no errors from extension content script
5. Navigate to https://x.com
6. Repeat the same checks

### 7. Test Reply Generation (Core Functionality)
1. Go to any tweet on Twitter/X
2. Click the "Reply" button (native Twitter button)
3. Verify "Suggest reply" button appears in the composer
4. Check that model and prompt dropdowns are populated
5. Select a model (e.g., "gpt-4o-mini")
6. Select a prompt variation (e.g., "Casual")
7. Click "Suggest reply" button
8. Verify loading state appears
9. Wait for reply generation
10. Verify reply is inserted into composer
11. Check that quality score badge appears
12. Verify usage counter updates in popup

### 8. Test Different Scenarios
- [ ] Test with different model selections
- [ ] Test with different prompt variations
- [ ] Test with various tweet types (text, images, videos)
- [ ] Test with long tweets
- [ ] Test with tweets containing emojis/special characters
- [ ] Test in threaded replies
- [ ] Test in quote tweets

## Error Handling Testing

### 9. Test Error Scenarios
1. **Network Error**: Disconnect internet, try to generate reply
   - [ ] Verify appropriate error message
   - [ ] Verify extension doesn't crash
   
2. **Authentication Error**: Sign out from web app, try to generate reply
   - [ ] Verify 401 error handling
   - [ ] Verify redirect to sign-in
   
3. **Quota Exceeded**: Use up quota, try to generate reply
   - [ ] Verify 402 error handling
   - [ ] Verify appropriate upgrade message

### 10. Test Edge Cases
- [ ] Rapid successive clicks on "Suggest reply"
- [ ] Extension disabled/re-enabled during use
- [ ] Multiple Twitter tabs open simultaneously
- [ ] Extension popup opened while generating reply
- [ ] Browser refresh during reply generation

## Performance Testing

### 11. Memory and Performance
1. Open Chrome Task Manager (Shift+Esc)
2. Monitor extension memory usage
3. Generate multiple replies
4. Check for memory leaks
5. Verify extension doesn't slow down Twitter

### 12. Load Testing
- [ ] Generate 10+ replies in succession
- [ ] Keep extension running for extended period
- [ ] Test with 10+ Twitter tabs open
- [ ] Verify no performance degradation

## API Integration Testing

### 13. Test All API Endpoints
1. **Authentication**: `/api/extension/auth`
2. **User Info**: `/api/auth/user`
3. **Usage Stats**: `/api/usage`
4. **Reply Generation**: `/api/generate-reply`
5. **Models**: `/api/models`
6. **Prompts**: `/api/prompts`
7. **Billing**: `/api/billing/portal`
8. **History**: `/api/reply-history`

### 14. Verify API Responses
- [ ] All endpoints return expected data
- [ ] Error responses are handled correctly
- [ ] CORS headers allow extension origin
- [ ] Authentication tokens are passed correctly

## UI/UX Testing

### 15. Test All Popup Features
- [ ] Usage stats display correctly
- [ ] Progress bar shows accurate percentage
- [ ] Reset time displays correctly
- [ ] History panel opens and functions
- [ ] Analytics panel works
- [ ] Settings panel accessible
- [ ] All animations work smoothly
- [ ] Responsive design on different screen sizes

### 16. Test Content Script UI
- [ ] "Suggest reply" button styling matches Twitter
- [ ] Quality score badge displays correctly
- [ ] Loading states are clear and informative
- [ ] Error messages are user-friendly
- [ ] No UI conflicts with Twitter's interface

## Security Testing

### 17. Security Verification
- [ ] No sensitive data exposed in console logs
- [ ] Authentication tokens stored securely
- [ ] No XSS vulnerabilities
- [ ] HTTPS-only API communication
- [ ] Minimal necessary permissions only
- [ ] No eval() or Function() constructor usage

### 18. Privacy Compliance
- [ ] No tracking without consent
- [ ] User data handled appropriately
- [ ] Privacy policy accessible
- [ ] No data leaks in extension storage

## Final Verification

### 19. Complete User Journey
1. Fresh Chrome profile
2. Install extension
3. Sign in
4. Generate multiple replies
5. Check usage stats
6. View history
7. Sign out and sign back in
8. Verify everything works end-to-end

### 20. Production Readiness
- [ ] No console.log statements (except errors)
- [ ] All features work as documented
- [ ] No console errors in any scenario
- [ ] Extension works on fresh Chrome profile
- [ ] All required assets prepared
- [ ] Store listing content written
- [ ] Privacy policy published

## Issues Found

Document any issues discovered during testing:

### Critical Issues
- [ ] (List any critical issues that prevent functionality)

### Minor Issues
- [ ] (List any minor issues that don't prevent functionality)

### Recommendations
- [ ] (List any improvements or recommendations)

## Test Results Summary

- **Total Tests**: ___
- **Passed**: ___
- **Failed**: ___
- **Critical Issues**: ___
- **Minor Issues**: ___

## Ready for Chrome Web Store Submission?

- [ ] All critical issues resolved
- [ ] All tests passed
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Security review passed
- [ ] Privacy compliance verified
- [ ] Required assets prepared
- [ ] Documentation complete

**Overall Status**: [ ] Ready / [ ] Needs Work

**Estimated Time to Fix Remaining Issues**: ___

**Recommendation**: [ ] Submit to Chrome Web Store / [ ] Fix issues first
