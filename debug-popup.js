// Simple debug script to test popup initialization
console.log('Debug popup script loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, checking elements...');
  
  // Check if elements exist
  const loadingState = document.getElementById('loading');
  const notAuthenticatedState = document.getElementById('not-authenticated');
  const authenticatedState = document.getElementById('authenticated');
  const analyticsPanel = document.getElementById('analytics-panel');
  
  console.log('Elements found:');
  console.log('- loading:', !!loadingState);
  console.log('- not-authenticated:', !!notAuthenticatedState);
  console.log('- authenticated:', !!authenticatedState);
  console.log('- analytics-panel:', !!analyticsPanel);
  
  // Check current visibility
  console.log('Current visibility:');
  console.log('- loading hidden:', loadingState?.classList.contains('hidden'));
  console.log('- not-authenticated hidden:', notAuthenticatedState?.classList.contains('hidden'));
  console.log('- authenticated hidden:', authenticatedState?.classList.contains('hidden'));
  console.log('- analytics-panel hidden:', analyticsPanel?.classList.contains('hidden'));
  
  // Force show loading state
  if (loadingState) {
    loadingState.classList.remove('hidden');
  }
  if (notAuthenticatedState) {
    notAuthenticatedState.classList.add('hidden');
  }
  if (authenticatedState) {
    authenticatedState.classList.add('hidden');
  }
  if (analyticsPanel) {
    analyticsPanel.classList.add('hidden');
  }
  
  console.log('Forced loading state to be visible');
});
