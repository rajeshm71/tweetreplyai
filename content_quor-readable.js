/**
 * Quora AI Extension - Content Script
 * Enhanced AI-powered reply generation for multiple platforms
 * 
 * This content script provides AI-powered reply suggestions across various
 * social media platforms including Twitter/X, LinkedIn, YouTube, Reddit, etc.
 */

(function() {
  "use strict";

  // ============================================================================
  // BROWSER EXTENSION POLYFILL & SETUP
  // ============================================================================

  // Browser extension polyfill for cross-browser compatibility
  const browser = (function() {
    if (!globalThis.chrome || !globalThis.chrome.runtime || !globalThis.chrome.runtime.id) {
      throw new Error("This script should only be loaded in a browser extension.");
    }
    
    if (globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id) {
      return globalThis.browser;
    }
    
    // Chrome API polyfill implementation
    return chrome;
  })();

  // ============================================================================
  // STORAGE & CONFIGURATION MANAGEMENT
  // ============================================================================

  /**
   * Configuration keys for storage
   */
  const STORAGE_KEYS = {
    licenseKey: 1,
    themeType: 1,
    longReplies: 1,
    profiles: 1,
    customInstructions: 1,
    hiddenTones: 1,
    tones: 1,
    proxy: 1
  };

  /**
   * Load settings from storage
   * @returns {Promise<Object>} - Settings object
   */
  async function loadSettings() {
    const settings = {
      ...await browser.storage.sync.get(Object.keys(STORAGE_KEYS)) || {}
    };
    
    // Set defaults
    settings.licenseKey = settings.licenseKey || "";
    settings.profiles = settings.profiles || [];
    settings.themeType = settings.themeType || "dark";
    settings.longReplies = settings.longReplies === undefined ? false : settings.longReplies;
    settings.customInstructions = settings.customInstructions || "";
    settings.hiddenTones = settings.hiddenTones || [];
    settings.tones = settings.tones || [];
    
    return settings;
  }

  /**
   * Save settings to storage
   * @param {Object} settings - Settings to save
   */
  async function saveSettings(settings) {
    try {
      await browser.storage.sync.set(settings);
    } catch (error) {
      if (error && error.message && error.message.includes("quota exceeded")) {
        await browser.storage.local.set(settings);
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if running in Firefox
   * @returns {boolean}
   */
  function isFirefox() {
    return /firefox/i.test(navigator.userAgent);
  }

  // ============================================================================
  // REACT COMPONENTS & UI LIBRARIES
  // ============================================================================

  /**
   * React JSX Runtime for component creation
   */
  const React = (function() {
    const Fragment = Symbol.for("react.fragment");
    
    function jsx(type, props) {
      const key = props.key !== undefined ? "" + props.key : null;
      const ref = props.ref !== undefined ? props.ref : null;
      
      if ("key" in props) {
        props = { ...props };
        delete props.key;
      }
      
      return {
        $$typeof: Symbol.for("react.transitional.element"),
        type: type,
        key: key,
        ref: ref,
        props: props
      };
    }
    
    return { Fragment, jsx, jsxs: jsx };
  })();

  /**
   * Styled Components System
   */
  const styled = (function() {
    // CSS-in-JS implementation
    function createStyledComponent(tag, styles) {
      return function(props) {
        const element = document.createElement(tag);
        
        // Apply styles based on props
        if (typeof styles === 'function') {
          const computedStyles = styles(props);
          Object.assign(element.style, computedStyles);
        } else {
          Object.assign(element.style, styles);
        }
        
        return element;
      };
    }
    
    return createStyledComponent;
  })();

  /**
   * Skeleton Loading Component
   */
  const Skeleton = (function() {
    function SkeletonComponent(props) {
      const { overrides = {}, rows = 0, animation = false, height, width } = props;
      
      const rootStyle = {
        display: "flex",
        flexDirection: "column",
        height: height,
        width: width,
        ...(animation ? {
          animationTimingFunction: "ease-out",
          animationDuration: "1.5s",
          animationIterationCount: "infinite",
          backgroundSize: "400% 100%",
          backgroundImage: `linear-gradient(90deg, 
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundSecondary || '#e0e0e0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
            ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'})`
          } : {
            backgroundColor: props.theme?.colors?.backgroundTertiary || '#f0f0f0'
          })
      };
      
      const rootElement = document.createElement('div');
      Object.assign(rootElement.style, rootStyle);
      rootElement.setAttribute('data-testid', 'loader');
      
      if (typeof rows === 'number' && rows !== 0) {
        for (let i = 0; i < rows; i++) {
          const rowElement = document.createElement('div');
          const rowStyle = {
            width: "100%",
            flexBasis: "15px",
            flexGrow: props.autoSizeRows ? 1 : 0,
            marginBottom: i === rows - 1 ? "0px" : "10px",
            ...(animation ? {
              animationTimingFunction: "ease-out",
              animationDuration: "1.5s",
              animationIterationCount: "infinite",
              backgroundSize: "400% 100%",
              backgroundImage: `linear-gradient(90deg, 
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundSecondary || '#e0e0e0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'},
                ${props.theme?.colors?.backgroundTertiary || '#f0f0f0'})`
              } : {
                backgroundColor: props.theme?.colors?.backgroundTertiary || '#f0f0f0'
              })
          };
          Object.assign(rowElement.style, rowStyle);
          rootElement.appendChild(rowElement);
        }
      }
      
      return rootElement;
    }
    
    return SkeletonComponent;
  })();

  /**
   * Icon Components (Lucide React)
   */
  const Icons = (function() {
    const iconProps = {
      xmlns: "http://www.w3.org/2000/svg",
      width: 24,
      height: 24,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    };
    
    function createIcon(name, paths) {
      return function(props) {
        const svg = document.createElement('svg');
        Object.assign(svg, iconProps, props);
        
        paths.forEach(([tag, attrs]) => {
          const element = document.createElement(tag);
          Object.assign(element, attrs);
          svg.appendChild(element);
        });
        
        return svg;
      };
    }
    
    return {
      Check: createIcon("check", [["path", { d: "M20 6 9 17l-5-5" }]]),
      ChevronDown: createIcon("chevron-down", [["path", { d: "m6 9 6 6 6-6" }]]),
      Sparkles: createIcon("sparkles", [
        ["path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }],
        ["path", { d: "M20 3v4" }],
        ["path", { d: "M22 5h-4" }],
        ["path", { d: "M4 17v2" }],
        ["path", { d: "M5 18H3" }]
      ])
    };
  })();

  // ============================================================================
  // HTTP CLIENT & API INTEGRATION
  // ============================================================================

  /**
   * Axios HTTP Client Configuration
   */
  const apiClient = (function() {
    const axios = {
      create: function(config) {
        return {
          interceptors: {
            response: {
              use: function(successHandler, errorHandler) {
                // Response interceptor implementation
              }
            }
          },
          get: async function(url, config) {
            return fetch(url, {
              method: 'GET',
              headers: config?.headers || {}
            }).then(response => response.json());
          },
          post: async function(url, data, config) {
            return fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...config?.headers
              },
              body: JSON.stringify(data)
            }).then(response => response.json());
          }
        };
      }
    };
    
    const client = axios.create({
      baseURL: "https://www.qura.ai/api"
    });
    
    // Response interceptor for error handling
    client.interceptors.response.use(
      function(response) { return response; },
      function(error) {
        console.error(error.message);
        return Promise.reject(error);
      }
    );
    
    return client;
  })();

  // ============================================================================
  // PLATFORM-SPECIFIC TEXT EXTRACTION & INSERTION
  // ============================================================================

  /**
   * Platform-specific implementations for text extraction and insertion
   */
  const PlatformHandlers = {
    
    /**
     * Twitter/X Platform Handler
     */
    x: {
      getText: function() {
        const tweetElement = document.querySelector('article[data-testid="tweet"][tabindex="-1"]');
        if (!tweetElement) return "";
        
        const tweetTextElement = tweetElement.querySelector('div[data-testid="tweetText"]');
        return tweetTextElement ? tweetTextElement.textContent : "";
      },
      
      setText: function(composer, text) {
        const textArea = this.findTextArea(composer);
        if (textArea) {
          this.insertText(textArea, composer, text);
        }
      },
      
      findTextArea: function(element) {
        const textArea = element.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"]');
        return textArea || (element.parentElement ? this.findTextArea(element.parentElement) : null);
      },
      
      insertText: function(textArea, composer, text) {
        composer.click();
        const dataTextSpan = textArea.querySelector('[data-text="true"]');
        const targetElement = dataTextSpan ? dataTextSpan.parentElement : textArea;
        
        if (targetElement) {
          targetElement.innerHTML = `<span data-text="true">${text}</span>`;
          targetElement.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true
          }));
        }
      }
    },

    /**
     * LinkedIn Platform Handler
     */
    linkedin: {
      getText: function(dataUrn) {
        const xpath = `//*[@data-urn="${dataUrn}"]/div/div/div[1]/div[2]/div/div`;
        const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue ||
                       document.querySelector(".attributed-text-segment-list__content[data-feed-control='commentary_text']");
        
        return element ? element.textContent.trim() : "";
      },
      
      setText: function(composer, text) {
        const quillEditor = composer.querySelector(".ql-editor");
        if (quillEditor) {
          quillEditor.innerHTML = `<p>${text}</p>`;
        } else {
          const textArea = composer.querySelector("#comment-editable-container.textarea");
          if (textArea) {
            textArea.textContent = text;
            textArea.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              data: text,
              inputType: "insertText"
            }));
          }
        }
      }
    },

    /**
     * YouTube Platform Handler
     */
    youtube: {
      getText: async function(composer) {
        const comments = this.extractComments(composer);
        const title = this.extractTitle();
        const videoId = window.location.href.split("v=")[1];
        
        if (!comments) {
          try {
            const { captions } = await this.getSubtitles(videoId, document.documentElement.lang);
            if (!captions && !title) {
              throw new Error("No captions or replies found");
            }
            return captions || title;
          } catch (error) {
            console.error("Failed to get subtitles:", error);
            return title;
          }
        }
        
        return comments;
      },
      
      setText: function(composer, text) {
        const contentEditable = composer.querySelector("div#contenteditable-root");
        if (!contentEditable) return;
        
        contentEditable.textContent = text;
        contentEditable.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: "insertText"
        }));
        contentEditable.dispatchEvent(new Event("change", { bubbles: true }));
        contentEditable.focus();
      },
      
      extractComments: function(composer) {
        const mainElement = composer.closest("#main");
        const expanderElement = mainElement?.querySelector("ytd-expander yt-attributed-string");
        
        if (expanderElement && expanderElement.childNodes) {
          return Array.from(expanderElement.childNodes)
            .map(node => node.textContent?.trim())
            .join(" ");
        }
        
        return null;
      },
      
      extractTitle: function() {
        const titleElement = document.querySelector("#title > h1 > yt-formatted-string");
        const descriptionElement = document.querySelector("yt-attributed-string > span");
        
        if (titleElement) {
          const title = titleElement.textContent?.trim();
          const description = descriptionElement?.firstChild?.textContent?.trim() || "";
          return `${title}, ${description}`;
        }
        
        return "";
      },
      
      getSubtitles: async function(videoId, language = "en") {
        return await browser.runtime.sendMessage({
          type: "getYoutubeSubtitles",
          videoID: videoId,
          lang: language
        });
      }
    },

    /**
     * Reddit Platform Handler
     */
    reddit: {
      getText: function(composer, isReply, dataUrn) {
        if (isReply) {
          const commentElement = composer.closest("shreddit-comment");
          const commentContent = commentElement?.querySelector("div[slot='comment']");
          return commentContent ? commentContent.textContent.trim() : "";
        }
        
        const titleElement = document.querySelector('h1[slot="title"]');
        const textElement = document.querySelector('div[slot="text-body"] p');
        
        const title = titleElement?.textContent?.trim() || "";
        const text = textElement?.textContent?.trim() || "";
        
        return `${title}, ${text}`;
      },
      
      setText: function(composer, text) {
        const textArea = composer.querySelector('div[name="body"][contenteditable="true"][role="textbox"]');
        if (textArea) {
          textArea.innerHTML = `
            <p dir="ltr" class="first:mt-0 last:mb-0">
              <span data-lexical-text="true">${text}</span>
            </p>
          `;
          textArea.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: "insertText"
          }));
          textArea.focus();
        }
      }
    },

    /**
     * Facebook Platform Handler
     */
    facebook: {
      getText: function(composer) {
        const virtualizedElement = composer.closest("div[data-virtualized=false]");
        const articleElement = virtualizedElement?.querySelector('div[role="article"] div.x1lliihq.xjkvuk6.x1iorvi4');
        
        if (articleElement) {
          const text = articleElement.textContent || 
                      Array.from(composer.querySelectorAll("img"))
                        .map(img => img.alt)
                        .filter(Boolean)
                        .join(" ");
          return text.trim();
        }
        
        // Fallback for thread composer
        const threadComposer = composer.closest("div[aria-label='Thread composer'][role='group']");
        const threadText = threadComposer?.parentElement?.querySelector("div:nth-child(1) div.html-div > div > div:nth-child(2)");
        
        if (threadText) {
          return threadText.textContent.trim();
        }
        
        // Additional fallbacks for different Facebook layouts
        const dialogElement = composer.closest('div[role="dialog"]') || 
                            composer.closest("div[data-adjust-on-keyboard-shown='true'][data-light-status-bar='true'][data-mcomponent='MScreen']");
        
        if (dialogElement) {
          const messageElement = dialogElement.querySelector('div[data-ad-preview="message"][data-ad-comet-preview="message"] > div > div > span > div') ||
                               dialogElement.querySelector("div[data-ad-rendering-role='story_message']");
          
          if (messageElement && messageElement.textContent) {
            return messageElement.textContent.trim();
          }
        }
        
        return "";
      },
      
      setText: function(composer, text, insertFunction) {
        const firstChild = composer.firstChild || composer;
        
        if (firstChild.tagName === "TEXTAREA") {
          const markElement = firstChild.nextElementSibling?.querySelector(".mark");
          const markText = markElement?.textContent;
          firstChild.value = markText ? `${markText} ${text}` : text;
          firstChild.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          const lexicalSpan = firstChild.querySelector("span[spellcheck=false][data-lexical-text=true]");
          
          if (lexicalSpan && lexicalSpan.textContent) {
            firstChild.style.marginBottom = "20px";
            insertFunction(text);
          } else {
            firstChild.focus();
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(firstChild);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
            firstChild.innerHTML = text;
            firstChild.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              cancelable: true,
              data: text,
              inputType: "insertText"
            }));
          }
        }
      }
    },

    /**
     * Discord Platform Handler
     */
    discord: {
      getText: function(composer) {
        const mainElement = composer.parentElement;
        const chatMessages = mainElement?.querySelector('div ol[data-list-id="chat-messages"][role="list"] div.replying__5126c div.contents_c19a55');
        const lastMessage = chatMessages?.lastChild;
        
        return lastMessage ? lastMessage.textContent.trim() : "";
      },
      
      setText: async function(composer, text, callback) {
        if (callback) {
          callback(text);
        }
      }
    },

    /**
     * Instagram Platform Handler
     */
    instagram: {
      getText: function() {
        const textArea = document.querySelector('form textarea[aria-label="Add a comment…"]');
        const textAreaValue = textArea?.innerHTML;
        
        if (textAreaValue && textAreaValue.charAt(0) === "@") {
          // Handle @mentions
          const mentions = document.querySelectorAll("main[role='main'] > div > div > div > div:nth-child(2) > div > div:nth-child(3) > div > div:nth-child(2) > div");
          const alternativeMentions = document.querySelectorAll("article > div > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > ul > div:nth-child(3) > div > div > div");
          
          const allMentions = mentions.length ? mentions : alternativeMentions;
          const filteredMentions = allMentions ? 
            Array.from(allMentions).filter(element => {
              const text = element.textContent;
              return text && text.startsWith(textAreaValue.substring(1).trim());
            }) : [];
          
          return filteredMentions[0]?.textContent?.trim() || "";
        }
        
        // Regular post content
        const mainContent = document.querySelector("main[role='main'] > div > div > div > div:nth-child(2) > div > div:nth-child(3) > div > div:nth-child(1) > div > div:nth-child(2) > div > span > div > span") ||
                           document.querySelector("h1");
        
        return mainContent?.textContent?.trim() || "";
      },
      
      setText: function(composer, text) {
        const textArea = composer.querySelector('textarea[aria-label="Add a comment…"]');
        if (textArea) {
          textArea.value = text;
          textArea.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            data: text
          }));
        }
      }
    }
  };

  // ============================================================================
  // MAIN TOOLBAR COMPONENT
  // ============================================================================

  /**
   * Main AI Toolbar Component
   * Renders the AI-powered reply generation interface
   */
  function AIToolbar({ toolBarEl, linkedInDataUrn, platform, commentReplyBox }) {
    const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
    const [dropdownRef, setDropdownRef] = React.useState(null);
    const [tooltipRef, setTooltipRef] = React.useState(null);
    const [profiles, setProfiles] = React.useState(null);
    const [isProfileLoading, setIsProfileLoading] = React.useState(false);
    const [isTooltipVisible, setIsTooltipVisible] = React.useState(false);
    const [tooltipPosition, setTooltipPosition] = React.useState("top");
    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = React.useState(false);
    const [profileTooltipPosition, setProfileTooltipPosition] = React.useState("top");
    const [profileDropdownRef, setProfileDropdownRef] = React.useState(null);
    
    // Settings and state management
    const [settings, setSettings] = React.useState({});
    const [tones, setTones] = React.useState([]);
    const [profilesList, setProfilesList] = React.useState([]);
    const [selectedProfile, setSelectedProfile] = React.useState(null);
    const [isTonesLoading, setIsTonesLoading] = React.useState(false);
    const [isProfilesLoading, setIsProfilesLoading] = React.useState(false);
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [isGeneratingReply, setIsGeneratingReply] = React.useState(false);
    const [isCreditsLoading, setIsCreditsLoading] = React.useState(false);
    const [credits, setCredits] = React.useState(0);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isRefreshingTones, setIsRefreshingTones] = React.useState(false);
    const [isCreditsVisible, setIsCreditsVisible] = React.useState(true);
    
    // Event handlers
    React.useEffect(() => {
      const handleMouseDown = (event) => {
        if (dropdownRef && !dropdownRef.contains(event.target)) {
          setIsDropdownOpen(false);
        }
      };
      
      const handleScroll = () => {
        if (isDropdownOpen) {
          updateTooltipPosition();
        }
      };
      
      document.addEventListener("mousedown", handleMouseDown);
      window.addEventListener("scroll", handleScroll);
      
      return () => {
        document.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener("scroll", handleScroll);
      };
    }, [isDropdownOpen]);
    
    const updateTooltipPosition = () => {
      if (tooltipRef) {
        const rect = tooltipRef.getBoundingClientRect();
        const top = rect.top;
        const bottom = window.innerHeight - rect.bottom;
        setTooltipPosition(bottom >= top ? "bottom" : "top");
      }
    };
    
    const toggleDropdown = React.useCallback(() => {
      if (!isDropdownOpen) {
        updateTooltipPosition();
      }
      setIsDropdownOpen(!isDropdownOpen);
    }, [isDropdownOpen]);
    
    // Load tones from API
    const loadTones = React.useCallback(async () => {
      if (settings.tones && settings.tones.length) {
        setTones(settings.tones);
        setIsRefreshingTones(true);
      } else {
        setIsTonesLoading(true);
      }
      
      try {
        const tonesData = await loadTonesFromAPI() || [];
        const tonesToUse = tonesData.length ? tonesData : settings.tones;
        setTones(tonesToUse);
        setSettings({ ...settings, tones: tonesToUse });
      } catch (error) {
        console.error("Failed to load tones:", error);
      } finally {
        setIsRefreshingTones(false);
        setIsTonesLoading(false);
      }
    }, [settings]);
    
    // Load profiles from API
    const loadProfiles = React.useCallback(async () => {
      if (settings.profiles && settings.profiles.length) {
        setProfilesList(settings.profiles);
        setSelectedProfile(settings.profiles.find(profile => profile.is_default === true) || null);
      } else {
        setIsProfilesLoading(true);
      }
      
      try {
        const profilesData = await loadProfilesFromAPI();
        setSelectedProfile(settings.profiles.find(profile => profile.is_default === true) || null);
        setProfilesList(profilesData);
      } catch (error) {
        console.error("Failed to load profiles:", error);
      } finally {
        setIsProfilesLoading(false);
      }
    }, [settings.profiles]);
    
    // Load credits from API
    const loadCredits = React.useCallback(async () => {
      if (settings.licenseKey) {
        try {
          const response = await apiClient.get("/getCreditsByLicense", {
            headers: { "license-key": settings.licenseKey }
          });
          setCredits(response.data.credits);
          setIsCreditsVisible(false);
        } catch (error) {
          const message = error.response?.data?.message || "";
          console.error("Failed to load credits:", message);
          setIsCreditsVisible(false);
        }
      }
    }, [settings.licenseKey]);
    
    // Initialize data
    React.useEffect(() => {
      loadTones();
      loadProfiles();
      loadCredits();
    }, [loadTones, loadProfiles, loadCredits]);
    
    // Generate AI reply
    const generateReply = async (toneId, event) => {
      if (event) {
        event.preventDefault();
      }
      
      if (!settings.licenseKey) {
        showNotification("Please navigate to the extension popup and enter a valid license key to continue.", "error");
        return;
      }
      
      setIsGenerating(toneId);
      
      try {
        const platformHandler = PlatformHandlers[platform];
        const text = await platformHandler.getText(toolBarEl, linkedInDataUrn, commentReplyBox);
        
        if (!text) {
          throw new Error("Unable to get text or content to generate a reply.");
        }
        
        const response = await generateAIResponse({
          message: text,
          licenseKey: settings.licenseKey,
          toneId: toneId,
          customInstructions: selectedProfile?.message || "",
          longReplies: selectedProfile?.enable_long_replies || false,
          platform: platform
        });
        
        if (response && response.message) {
          throw new Error(response.message);
        }
        
        // Clean and format the response
        const cleanedReply = response.reply.trim()
          .replace(/^"/g, "")
          .replace(/"$/g, "")
          .replace(/[—-]/g, "\n")
          .replace(/\n/g, " ")
          .replace("  ", " ")
          .trim();
        
        // Insert the reply
        platformHandler.setText(toolBarEl, cleanedReply, insertTextFunction);
        
        // Update credits
        await updateCredits();
        
      } catch (error) {
        showNotification(error.message, "error");
      } finally {
        setIsGenerating("");
      }
    };
    
    // Update credits
    const updateCredits = async () => {
      if (settings.licenseKey) {
        try {
          const response = await apiClient.get("/getCreditsByLicense", {
            headers: { "license-key": settings.licenseKey }
          });
          setCredits(response.data.credits);
        } catch (error) {
          console.error("Error updating credits:", error);
        } finally {
          setIsCreditsVisible(false);
        }
      }
    };
    
    // Copy to clipboard
    const copyToClipboard = async (event) => {
      event.preventDefault();
      if (generatedText && !isGeneratingReply) {
        await navigator.clipboard.writeText(generatedText);
        setIsGeneratingReply(true);
        setTimeout(() => setIsGeneratingReply(false), 2000);
      }
    };
    
    // Render profile switcher for Twitter/X
    const renderProfileSwitcher = React.useCallback(() => {
      if (window.location.href.includes("x.com")) {
        const navElement = toolBarEl.querySelector("nav");
        if (navElement && profilesList.length > 0) {
          if (navElement.querySelector(".react-profile-switcher")) return;
          
          const switcherElement = document.createElement("div");
          switcherElement.classList.add("react-profile-switcher");
          navElement.appendChild(switcherElement);
          
          // Render React component (simplified)
          const switcherHTML = `
            <div class="tooltip-container" onmouseenter="showTooltip()" onmouseleave="hideTooltip()">
              <div style="position: relative;">
                <button class="dropdown-trigger" onclick="toggleProfileDropdown()">
                  <svg class="sparkles-icon" width="20" height="20">${Icons.Sparkles()}</svg>
                  <svg class="chevron-icon" width="16" height="16">${Icons.ChevronDown()}</svg>
                </button>
                ${isProfileDropdownOpen ? `
                  <div class="dropdown-menu dropdown-menu-top">
                    ${profilesList.map(profile => `
                      <div class="dropdown-menu-item" onclick="selectProfile('${profile.id}')">
                        ${profile.title}
                        ${profile.is_default ? `<svg class="check-icon" width="16" height="16">${Icons.Check()}</svg>` : ''}
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
              ${isTooltipVisible && !isProfileDropdownOpen ? `
                <div class="tooltip-content ${profileTooltipPosition === 'top' ? 'tooltip-top' : 'tooltip-bottom'}">
                  AI instructions
                </div>
              ` : ''}
            </div>
          `;
          
          switcherElement.innerHTML = switcherHTML;
        }
      }
    }, [profilesList, isProfileDropdownOpen, isTooltipVisible, profileTooltipPosition, toolBarEl]);
    
    React.useEffect(() => {
      renderProfileSwitcher();
      return () => {
        const switcherElement = document.querySelector(".react-profile-switcher");
        if (switcherElement) {
          switcherElement.remove();
        }
      };
    }, [renderProfileSwitcher]);
    
    // Render the toolbar
    return `
      <div class="ai-toolbar" onclick="event.stopPropagation()">
        <div class="toolbar-content">
          ${isTonesLoading ? `
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${Array.from({ length: 8 }).map(() => `
                <div class="skeleton-loader" style="height: 30px; width: 80px; border-radius: 5px;"></div>
              `).join('')}
            </div>
          ` : tones.length === 0 ? `
            <div class="invalid-license">
              <p style="color: white;">
                Please navigate to the extension popup and enter a valid license key.
                <div class="warning-button-container">
                  <a href="https://www.qura.ai/docs" target="_blank" rel="noreferrer noopener" class="guide-me">Guide Me</a>
                  <a href="https://www.qura.ai/dashboard/settings" target="_blank" rel="noreferrer noopener" class="account-settings">Open Account Settings</a>
                </div>
              </p>
            </div>
          ` : `
            <div class="toolbar-main">
              ${(platform === "discord" || generatedText) ? `
                <p class="warning-info">
                  <span class="info">📋 GUIDE:</span>
                  ${platform !== "discord" ? 
                    "Your text has been generated, copy and paste into the textbox." : 
                    "Please highlight a message you wish to reply to, then pick a tone. Your text will be generated and you can copy it into the textbox."
                  }
                </p>
                ${generatedText ? `
                  <div class="external-response-container">
                    <p class="external-response-text">${generatedText}</p>
                    <button onclick="copyToClipboard(event)" class="external-copy-button ${isGeneratingReply ? 'copy-success' : ''}">
                      ${isGeneratingReply ? '✓' : '📋'}
                    </button>
                  </div>
                ` : ''}
              ` : ''}
              
              <div class="button-container" style="margin-inline: ${platform === 'threads' ? '20px' : 'auto'};">
                ${tones.filter(tone => !settings.hiddenTones.includes(tone.id)).map(tone => `
                  <button onclick="generateReply('${tone.id}', event)" 
                          class="tone-button ${isGenerating === tone.id ? 'loading-button' : ''}">
                    ${isGenerating === tone.id ? '⏳' : ''}
                    <span style="word-spacing: 4px;">
                      ${tone.name}
                      ${isGenerating === tone.id ? '...' : ''}
                    </span>
                  </button>
                `).join('')}
                
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-direction: column;">
                  ${isCreditsVisible ? `
                    <div class="loading-spinner"></div>
                  ` : `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div style="font-size: 14px; color: ${platform === 'discord' ? '#007AFF' : ''};">
                        Credits: ${credits}
                      </div>
                      <a href="https://www.qura.ai/pricing" target="_blank" rel="noreferrer noopener" 
                         style="text-decoration: underline; font-size: 12px;">
                        Get More
                      </a>
                    </div>
                  `}
                </div>
                
                <button class="refresh-button ${isRefreshingTones ? 'loading' : ''}" 
                        onclick="loadTones()">
                  🔄
                </button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Load tones from API
   * @returns {Promise<Array>} - Array of tone objects
   */
  async function loadTonesFromAPI() {
    try {
      const response = await apiClient.get("/getTones");
      return response.data || [];
    } catch (error) {
      console.error("Failed to load tones:", error);
      return [];
    }
  }

  /**
   * Load profiles from API
   * @returns {Promise<Array>} - Array of profile objects
   */
  async function loadProfilesFromAPI() {
    const settings = await loadSettings();
    if (!settings.licenseKey) return [];
    
    try {
      const response = await browser.runtime.sendMessage({
        type: "getCustomProfiles",
        licenseKey: settings.licenseKey
      });
      await saveSettings({ ...settings, profiles: response || [] });
      return response || [];
    } catch (error) {
      console.error("Failed to load profiles:", error);
      return [];
    }
  }

  /**
   * Generate AI response
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} - AI response
   */
  async function generateAIResponse(params) {
    try {
      const response = await apiClient.post("/generateReply", params);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Failed to generate reply");
    }
  }

  /**
   * Show notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, info)
   */
  function showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `ai-notification ai-notification--${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      padding: "12px 16px",
      borderRadius: "8px",
      color: "white",
      fontSize: "14px",
      fontWeight: "500",
      zIndex: "10000",
      maxWidth: "300px",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      backgroundColor: type === "error" ? "#ef4444" : type === "success" ? "#10b981" : "#3b82f6"
    });
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  /**
   * Insert text function for platforms that need it
   * @param {string} text - Text to insert
   */
  function insertTextFunction(text) {
    // This function is passed to platform handlers that need custom text insertion
    console.log("Inserting text:", text);
  }

  // ============================================================================
  // INITIALIZATION & EXPORT
  // ============================================================================

  /**
   * Initialize the content script
   */
  function initialize() {
    console.log("Quora AI Content Script initialized");
    
    // Set up message listeners
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "getCustomProfiles") {
        // Handle profile requests
        sendResponse({ success: true });
      }
    });
    
    // Initialize platform detection and toolbar injection
    detectPlatformAndInjectToolbar();
  }

  /**
   * Detect current platform and inject appropriate toolbar
   */
  function detectPlatformAndInjectToolbar() {
    const currentUrl = window.location.href;
    let platform = null;
    
    // Platform detection logic
    if (currentUrl.includes("x.com") || currentUrl.includes("twitter.com")) {
      platform = "x";
    } else if (currentUrl.includes("linkedin.com")) {
      platform = "linkedin";
    } else if (currentUrl.includes("youtube.com")) {
      platform = "youtube";
    } else if (currentUrl.includes("reddit.com")) {
      platform = "reddit";
    } else if (currentUrl.includes("facebook.com")) {
      platform = "facebook";
    } else if (currentUrl.includes("discord.com")) {
      platform = "discord";
    } else if (currentUrl.includes("instagram.com")) {
      platform = "instagram";
    }
    
    if (platform) {
      injectToolbarForPlatform(platform);
    }
  }

  /**
   * Inject toolbar for specific platform
   * @param {string} platform - Platform identifier
   */
  function injectToolbarForPlatform(platform) {
    // Find appropriate toolbar container based on platform
    const toolbarContainer = findToolbarContainer(platform);
    
    if (toolbarContainer) {
      // Create and inject the AI toolbar
      const toolbarElement = document.createElement("div");
      toolbarElement.innerHTML = AIToolbar({
        toolBarEl: toolbarContainer,
        platform: platform,
        commentReplyBox: null,
        linkedInDataUrn: null
      });
      
      toolbarContainer.appendChild(toolbarElement);
    }
  }

  /**
   * Find toolbar container for platform
   * @param {string} platform - Platform identifier
   * @returns {HTMLElement|null} - Toolbar container element
   */
  function findToolbarContainer(platform) {
    const selectors = {
      x: '[data-testid="toolBar"]',
      linkedin: '.ql-toolbar',
      youtube: '#comments #header',
      reddit: '[data-test="comment-form"]',
      facebook: '[role="toolbar"]',
      discord: '[data-list-id="chat-messages"]',
      instagram: 'form textarea[aria-label="Add a comment…"]'
    };
    
    return document.querySelector(selectors[platform]);
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  // Export for global access
  window.QuoraAI = {
    PlatformHandlers,
    AIToolbar,
    showNotification,
    loadSettings,
    saveSettings
  };

})();
