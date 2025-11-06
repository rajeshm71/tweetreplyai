export interface StatValue {
  value: number;
  formatted: string;
  weeklyIncrease?: string;
}

export interface Stats {
  repliesGenerated: StatValue;
  impressions: StatValue;
  engagementsBoost: StatValue;
  hoursSaved: StatValue;
}

const STORAGE_KEY = 'tweetreply_stats';
const LAST_UPDATE_KEY = 'tweetreply_stats_last_update';
const WEEKLY_VALUES_KEY = 'tweetreply_stats_weekly';

interface StoredStats {
  repliesGenerated: number;
  impressions: number;
  engagementsBoost: number;
  hoursSaved: number;
  timestamp: number;
}

interface WeeklyValues {
  repliesGenerated: number[];
  timestamps: number[];
}

// Format number with K/M abbreviations
// Fixed: Added input validation to handle edge cases
function formatNumber(num: number): string {
  // Validate input: handle NaN, Infinity, and negative numbers
  if (!Number.isFinite(num) || num < 0) {
    return '0';
  }
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  } else {
    return Math.floor(num).toLocaleString();
  }
}

// Format number with commas (no abbreviation)
// Fixed: Added input validation
function formatNumberWithCommas(num: number): string {
  // Validate input: handle NaN, Infinity, and negative numbers
  if (!Number.isFinite(num) || num < 0) {
    return '0';
  }
  return Math.floor(num).toLocaleString();
}

// Get random number between min and max
function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Check if we need to update stats (every hour)
// Fixed: Added SSR safety check and input validation
function shouldUpdateStats(): boolean {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  
  try {
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
    if (!lastUpdate) return true;
    
    const lastUpdateTime = parseInt(lastUpdate, 10);
    // Fixed: Validate parseInt result to handle corrupted data
    if (isNaN(lastUpdateTime)) {
      return true;
    }
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    return (now - lastUpdateTime) >= oneHour;
  } catch (e) {
    // Fixed: Handle localStorage errors (quota exceeded, etc.)
    console.error('Error checking stats update:', e);
    return false;
  }
}

// Get default stats structure
function getDefaultStats(): StoredStats {
  return {
    repliesGenerated: 0,
    impressions: 0,
    engagementsBoost: 0,
    hoursSaved: 0,
    timestamp: Date.now()
  };
}

// Get stored stats or initialize to 0
// Fixed: Added SSR safety check and improved error handling
function getStoredStats(): StoredStats {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return getDefaultStats();
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Fixed: Validate parsed data structure
      if (parsed && typeof parsed === 'object' && 
          typeof parsed.repliesGenerated === 'number' &&
          typeof parsed.impressions === 'number' &&
          typeof parsed.engagementsBoost === 'number' &&
          typeof parsed.hoursSaved === 'number') {
        return parsed;
      } else {
        // Corrupted data - clear it
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (e) {
    // Fixed: Handle JSON parse errors and clear corrupted data
    console.error('Error parsing stored stats:', e);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (clearError) {
      console.error('Error clearing corrupted stats:', clearError);
    }
  }
  
  // Initialize with 0
  return getDefaultStats();
}

// Get weekly values for calculating % increase
// Fixed: Added SSR safety check and improved error handling
function getWeeklyValues(): WeeklyValues {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      repliesGenerated: [],
      timestamps: []
    };
  }
  
  try {
    const stored = localStorage.getItem(WEEKLY_VALUES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Fixed: Validate parsed data structure
      if (parsed && Array.isArray(parsed.repliesGenerated) && 
          Array.isArray(parsed.timestamps) &&
          parsed.repliesGenerated.length === parsed.timestamps.length) {
        return parsed;
      } else {
        // Corrupted data - clear it
        localStorage.removeItem(WEEKLY_VALUES_KEY);
      }
    }
  } catch (e) {
    // Fixed: Handle JSON parse errors and clear corrupted data
    console.error('Error parsing weekly values:', e);
    try {
      localStorage.removeItem(WEEKLY_VALUES_KEY);
    } catch (clearError) {
      console.error('Error clearing corrupted weekly values:', clearError);
    }
  }
  
  return {
    repliesGenerated: [],
    timestamps: []
  };
}

// Store weekly values (keep last 7 days)
// Fixed: Added SSR safety check and error handling for localStorage quota
function storeWeeklyValue(repliesGenerated: number): void {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  
  try {
    const weekly = getWeeklyValues();
    const now = Date.now();
    
    // Add current value
    weekly.repliesGenerated.push(repliesGenerated);
    weekly.timestamps.push(now);
    
    // Remove values older than 7 days
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const filteredReplies = [];
    const filteredTimestamps = [];
    
    for (let i = 0; i < weekly.repliesGenerated.length; i++) {
      if (weekly.timestamps[i] >= sevenDaysAgo) {
        filteredReplies.push(weekly.repliesGenerated[i]);
        filteredTimestamps.push(weekly.timestamps[i]);
      }
    }
    
    // Fixed: Limit array size to prevent unbounded growth (max 8 days worth of hourly data)
    const maxEntries = 8 * 24; // 8 days * 24 hours
    if (filteredReplies.length > maxEntries) {
      // Keep only the most recent entries
      const startIndex = filteredReplies.length - maxEntries;
      weekly.repliesGenerated = filteredReplies.slice(startIndex);
      weekly.timestamps = filteredTimestamps.slice(startIndex);
    } else {
      weekly.repliesGenerated = filteredReplies;
      weekly.timestamps = filteredTimestamps;
    }
    
    localStorage.setItem(WEEKLY_VALUES_KEY, JSON.stringify(weekly));
  } catch (e) {
    // Fixed: Handle localStorage quota exceeded and other errors
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old weekly data');
      try {
        // Clear old data and try again
        const weekly = getWeeklyValues();
        // Keep only last 3 days
        const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
        const filtered = {
          repliesGenerated: weekly.repliesGenerated.filter((_, i) => weekly.timestamps[i] >= threeDaysAgo),
          timestamps: weekly.timestamps.filter(t => t >= threeDaysAgo)
        };
        localStorage.setItem(WEEKLY_VALUES_KEY, JSON.stringify(filtered));
      } catch (retryError) {
        console.error('Error retrying weekly value storage:', retryError);
      }
    } else {
      console.error('Error storing weekly value:', e);
    }
  }
}

// Calculate weekly % increase for replies
// Fixed: Improved to find value closest to exactly 7 days ago for more accurate calculation
function calculateWeeklyIncrease(currentValue: number): string | undefined {
  const weekly = getWeeklyValues();
  if (weekly.repliesGenerated.length === 0) return undefined;
  
  // Fixed: Find value closest to exactly 7 days ago (not just oldest)
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  let closestValue = null;
  let closestDiff = Infinity;
  
  for (let i = 0; i < weekly.timestamps.length; i++) {
    const diff = Math.abs(weekly.timestamps[i] - sevenDaysAgo);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestValue = weekly.repliesGenerated[i];
    }
  }
  
  // Fixed: Validate closestValue before calculation
  if (closestValue === null || closestValue === undefined || closestValue === 0) {
    return undefined;
  }
  
  // Fixed: Validate currentValue before calculation
  if (!Number.isFinite(currentValue) || currentValue <= closestValue) {
    return undefined;
  }
  
  const increase = ((currentValue - closestValue) / closestValue) * 100;
  if (!Number.isFinite(increase) || increase <= 0) {
    return undefined;
  }
  
  return `+${increase.toFixed(1)}% this week`;
}

// Update stats with random increments
// Fixed: Added SSR safety check and error handling for localStorage quota
function updateStats(): StoredStats {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return getDefaultStats();
  }
  
  const current = getStoredStats();
  
  // Generate random increments
  const repliesIncrement = randomBetween(50, 200);
  const impressionsIncrement = randomBetween(5000, 15000);
  const engagementsIncrement = randomBetween(2, 8);
  
  // Fixed: Validate increments are finite numbers
  const safeRepliesIncrement = Number.isFinite(repliesIncrement) ? repliesIncrement : 0;
  const safeImpressionsIncrement = Number.isFinite(impressionsIncrement) ? impressionsIncrement : 0;
  const safeEngagementsIncrement = Number.isFinite(engagementsIncrement) ? engagementsIncrement : 0;
  
  // Calculate hours saved based on total replies generated
  // Assumption: ~1.2 minutes saved per reply on average (manual: ~1.5-2 min, AI: ~0.2-0.3 min)
  // For 100 replies: 100 * 1.2 / 60 = 2.0 hours (realistic)
  // Add small random variation (±0.1 min per reply) for realism: 1.1-1.3 min per reply
  // For 100 replies: 110-130 minutes = 1.83-2.17 hours
  const totalReplies = Math.max(0, current.repliesGenerated + safeRepliesIncrement);
  const minutesSavedPerReply = randomBetween(1.1, 1.3); // minutes (small variation for realism)
  const hoursSaved = (totalReplies * minutesSavedPerReply) / 60;
  
  // Update values
  const updated: StoredStats = {
    repliesGenerated: totalReplies,
    impressions: Math.max(0, current.impressions + safeImpressionsIncrement),
    engagementsBoost: Math.max(0, current.engagementsBoost + safeEngagementsIncrement),
    hoursSaved: Number.isFinite(hoursSaved) && hoursSaved >= 0 ? hoursSaved : 0,
    timestamp: Date.now()
  };
  
  // Fixed: Handle localStorage quota exceeded and other errors
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem(LAST_UPDATE_KEY, updated.timestamp.toString());
    
    // Store weekly value for replies
    storeWeeklyValue(updated.repliesGenerated);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old stats data');
      try {
        // Clear old weekly data to free up space
        localStorage.removeItem(WEEKLY_VALUES_KEY);
        // Try storing again
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        localStorage.setItem(LAST_UPDATE_KEY, updated.timestamp.toString());
      } catch (retryError) {
        console.error('Error retrying stats storage:', retryError);
      }
    } else {
      console.error('Error storing stats:', e);
    }
  }
  
  return updated;
}

// Generate and format stats
// Fixed: Added input validation and safe number formatting
export function generateStats(): Stats {
  // SSR safety: Return default stats if localStorage unavailable
  if (typeof window === 'undefined' || !window.localStorage) {
    const defaultStats = getDefaultStats();
    return {
      repliesGenerated: {
        value: 0,
        formatted: '0',
        weeklyIncrease: undefined
      },
      impressions: {
        value: 0,
        formatted: '0'
      },
      engagementsBoost: {
        value: 0,
        formatted: '0%'
      },
      hoursSaved: {
        value: 0,
        formatted: '0.0 hrs'
      }
    };
  }
  
  // Check if we need to update
  if (shouldUpdateStats()) {
    updateStats();
  }
  
  const stored = getStoredStats();
  
  // Fixed: Validate values before formatting
  const safeReplies = Number.isFinite(stored.repliesGenerated) && stored.repliesGenerated >= 0 
    ? stored.repliesGenerated 
    : 0;
  const safeImpressions = Number.isFinite(stored.impressions) && stored.impressions >= 0 
    ? stored.impressions 
    : 0;
  const safeEngagements = Number.isFinite(stored.engagementsBoost) && stored.engagementsBoost >= 0 
    ? stored.engagementsBoost 
    : 0;
  const safeHours = Number.isFinite(stored.hoursSaved) && stored.hoursSaved >= 0 
    ? stored.hoursSaved 
    : 0;
  
  // Format replies (use commas until 100K, then K format)
  const repliesFormatted = safeReplies < 100000
    ? formatNumberWithCommas(safeReplies)
    : formatNumber(safeReplies);
  
  const weeklyIncrease = calculateWeeklyIncrease(safeReplies);
  
  return {
    repliesGenerated: {
      value: safeReplies,
      formatted: repliesFormatted,
      weeklyIncrease
    },
    impressions: {
      value: safeImpressions,
      formatted: formatNumber(safeImpressions)
    },
    engagementsBoost: {
      value: safeEngagements,
      formatted: `${Math.floor(safeEngagements)}%`
    },
    hoursSaved: {
      value: safeHours,
      formatted: `${safeHours.toFixed(1)} hrs`
    }
  };
}

// Initialize stats on first load
// Fixed: Added SSR safety check
export function initializeStats(): void {
  // SSR safety: localStorage only available in browser
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  
  try {
    const stored = getStoredStats();
    if (stored.repliesGenerated === 0 && stored.impressions === 0) {
      // First time - do an initial update
      updateStats();
    } else if (shouldUpdateStats()) {
      updateStats();
    }
  } catch (e) {
    // Fixed: Handle any errors during initialization gracefully
    console.error('Error initializing stats:', e);
  }
}

