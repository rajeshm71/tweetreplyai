/**
 * Twitter Reply AI Extension - Content Script
 * Based on analysis of working inject.js implementation
 * Handles AI-powered reply generation for Twitter/X
 */

(function() {
  "use strict";

  // Configuration
  const BUTTON_ICON_URL = chrome.runtime.getURL("icons/button.svg");
  const ERROR_ICON_URL = chrome.runtime.getURL("icons/button_error.svg");
  const PRIMARY_COLOR = "rgb(29, 155, 240)";

  // Utility Functions
  function setElementStyle(element, cssText) {
    try {
      element.style.cssText = cssText;
    } catch (error) {
      try {
        element.style.display = "flex";
        element.style.padding = "4px 8px";
      } catch (e) {
        // Fallback styling
      }
    }
  }

  function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function stripReplyPrefix(text) {
    const prefixes = [
      "Question", "Supportive", "Disagree", "Enhance", "Smart", 
      "Controversial", "Marketing", "Product-marketing"
    ];
    
    let cleaned = text.trim();
    
    // Remove style prefixes
    for (const prefix of prefixes) {
      const regex = new RegExp(`^\\b${prefix}\\b\\s*[^\\w\\s]*\\s*`, "i");
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, "").trim();
        break;
      }
    }
    
    // Remove extra punctuation patterns like "Supportive: " or "Smart, "
    const punctuationRegex = /^([A-Z][a-z]+)([\-:.,!]+)\s+/;
    if (punctuationRegex.test(cleaned) && !cleaned.match(/^[A-Za-z]+,\s/)) {
      cleaned = cleaned.replace(punctuationRegex, "").trim();
    }
    
    return cleaned;
  }

  // Reply Style Configurations
  const QUICK_REPLY_STYLES = [
    { emoji: "👍", type: "supportive" },
    { emoji: "❓", type: "question" },
    { emoji: "🧠", type: "smart" },
    { emoji: "✨", type: "enhance" }
  ];

  const DM_REPLY_STYLES = [
    { emoji: "👍", type: "supportive", label: "" },
    { emoji: "❌", type: "disagree", label: "Disagree" },
    { emoji: "❓", type: "question", label: "Ask" },
    { emoji: "🚀", type: "product-marketing", label: "Marketing" }
  ];

  const EXTENDED_REPLY_STYLES = [
    { emoji: "👍", type: "supportive", label: "Supportive" },
    { emoji: "❌", type: "disagree", label: "Disagree" },
    { emoji: "❓", type: "question", label: "Question" },
    { emoji: "😂", type: "laughing", label: "Laughing" },
    { emoji: "🙏", type: "grateful", label: "Grateful" },
    { emoji: "🤔", type: "curious", label: "Curious" },
    { emoji: "👔", type: "professional", label: "Professional" },
    { emoji: "💖", type: "empathetic", label: "Empathetic" },
    { emoji: "💡", type: "insightful", label: "Insightful" },
    { emoji: "🚀", type: "product-marketing", label: "Marketing" }
  ];

  const MORE_REPLY_STYLES = [
    { emoji: "🚀", type: "product-marketing" },
    { emoji: "🔥", type: "controversial" },
    { emoji: "😂", type: "funny" },
    { emoji: "👏", type: "appreciative" },
    { emoji: "🤔", type: "thoughtful" },
    { emoji: "💡", type: "insightful" },
    { emoji: "🔍", type: "analytical" },
    { emoji: "💼", type: "professional" },
    { emoji: "❤️", type: "friendly" }
  ];

  // Detection Functions
  function isDMComposer() {
    return !!document.querySelector('div[data-testid="dmComposerTextInput"]') ||
           !!document.querySelector('[data-testid="DmScrollerContainer"]') ||
           window.location.pathname.includes("/messages/");
  }

  function getMessageHistory(limit = 10) {
    try {
      const messageEntries = document.querySelectorAll('[data-testid="messageEntry"]');
      if (!messageEntries || messageEntries.length === 0) return [];
      
      return Array.from(messageEntries).slice(-limit).map(entry => {
        const isOther = entry.getAttribute("tabindex") === "0";
        const tweetText = entry.querySelector('[data-testid="tweetText"]');
        const content = tweetText && tweetText.textContent || "";
        const timestamp = entry.querySelector('.css-1jxf684[style*="color: rgb(113, 118, 123)"]');
        
        return {
          sender: isOther ? "other" : "user",
          content: content,
          timestamp: timestamp && timestamp.textContent || undefined
        };
      });
    } catch (error) {
      return [];
    }
  }

  function getRecipientName() {
    try {
      const detailHeader = document.querySelector('h2[id="detail-header"]');
      if (detailHeader) {
        const nameSpan = detailHeader.querySelector("span.css-1jxf684 span.css-1jxf684 > span.css-1jxf684");
        if (nameSpan) return nameSpan.textContent?.trim();
      }
      
      const dmDrawer = document.querySelector('[data-testid="DMDrawer"] h2 span, [data-testid="conversation"] h2 span');
      return dmDrawer ? dmDrawer.textContent?.trim() : undefined;
    } catch (error) {
      return undefined;
    }
  }

  // Text Insertion Function (Main Implementation)
  async function insertTextIntoElement(element, text, selection) {
    const cleanText = text.replace(/<[^>]*>/g, "");
    element.focus();
    
    try {
      // Handle Quill editor
      if (element.classList && element.classList.contains("ql-editor")) {
        try {
          element.innerHTML = "";
          cleanText.split("\n").forEach(line => {
            if (line.trim()) {
              const p = document.createElement("p");
              p.textContent = line;
              element.appendChild(p);
            } else {
              const p = document.createElement("p");
              p.innerHTML = "<br>";
              element.appendChild(p);
            }
          });
          
          if (element.childNodes.length === 0) {
            const p = document.createElement("p");
            p.innerHTML = "<br>";
            element.appendChild(p);
          }
          
          element.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        } catch (error) {
          // Continue to next method
        }
      }

      // Handle Twitter Draft.js editor
      if (element.getAttribute("data-testid") === "dmComposerTextInput" || 
          element.classList.contains("public-DraftEditor-content")) {
        
        // Try execCommand first
        try {
          document.execCommand("insertText", false, cleanText);
          return;
        } catch (error) {
          // Continue to fallback
        }
        
        // Fallback: Direct DOM manipulation
        try {
          const contentDiv = element.querySelector('[data-contents="true"]');
          if (contentDiv) {
            const blocks = contentDiv.querySelectorAll('[data-block="true"]');
            if (blocks.length > 0) {
              const textBlock = blocks[0].querySelector(".public-DraftStyleDefault-block");
              if (textBlock) {
                textBlock.textContent = cleanText;
                element.dispatchEvent(new InputEvent("input", {
                  bubbles: true,
                  cancelable: true
                }));
                return;
              }
            }
          }
        } catch (error) {
          // Continue to next fallback
        }
        
        // Final fallback: Input events
        try {
          element.dispatchEvent(new InputEvent("beforeinput", {
            inputType: "insertText",
            data: cleanText,
            bubbles: true,
            cancelable: true
          }));
          element.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true
          }));
          return;
        } catch (error) {
          // Continue to next method
        }
      }

      // Handle regular inputs
      if (selection) {
        selection.deleteContents();
        selection.insertNode(document.createTextNode(cleanText));
        return;
      }

      // Direct value/textContent assignment
      if (element.value !== undefined) {
        element.value = cleanText;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (element.textContent !== undefined) {
        element.textContent = cleanText;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      
    } catch (error) {
      console.error("Error inserting text:", error);
    }
    
    element.focus();
  }

  // DM Button Creation
  async function createDMButtons() {
    try {
      const dmContainer = document.querySelector('div[data-testid="dmComposerTextInputRichTextInputContainer"]');
      if (!dmContainer) return;
      
      if (document.getElementById("GPT_DM_BUTTONS")) return;

      const buttonContainer = document.createElement("div");
      buttonContainer.id = "GPT_DM_BUTTONS";
      setElementStyle(buttonContainer, `
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      `);

      // Create DM reply buttons
      DM_REPLY_STYLES.forEach(({ emoji, type, label }) => {
        const button = document.createElement("div");
        button.className = "gpt-dm-button";
        setElementStyle(button, `
          padding: 3px 6px;
          border-radius: 14px;
          background-color: rgba(29, 155, 240, 0.1);
          color: ${PRIMARY_COLOR};
          cursor: pointer;
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 3px;
          line-height: 1;
        `);
        
        button.innerHTML = `<span style="font-size: 12px; margin-right: 2px;">${emoji}</span>${label}`;
        
        button.onmouseover = () => {
          try {
            button.style.backgroundColor = "rgba(29, 155, 240, 0.2)";
          } catch (e) {}
        };
        
        button.onmouseout = () => {
          try {
            button.style.backgroundColor = "rgba(29, 155, 240, 0.1)";
          } catch (e) {}
        };
        
        button.onclick = async () => {
          try {
            const messageHistory = getMessageHistory(10);
            const recipientName = getRecipientName();
            const originalHTML = button.innerHTML;
            
            button.innerHTML = "⏳";
            button.style.opacity = "0.7";
            
            const dmParams = {
              platform: "twitter",
              messageHistory: messageHistory,
              replyStyle: type,
              recipientName: recipientName
            };
            
            const response = await chrome.runtime.sendMessage({
              type: "GENERATE_DM_REPLY",
              dmParams: dmParams
            });
            
            button.innerHTML = originalHTML;
            button.style.opacity = "1";
            
            if (response && !response.error) {
              const dmInput = document.querySelector('[data-testid="dmComposerTextInput"]');
              if (dmInput) {
                const cleanedReply = stripReplyPrefix(response.reply);
                await insertTextIntoElement(dmInput, cleanedReply);
              }
            } else if (response && response.error && response.error.type === "credits") {
              alert(response.error.message);
            }
          } catch (error) {
            button.innerHTML = "❌";
            setTimeout(() => {
              button.innerHTML = `<span style="font-size: 12px; margin-right: 2px;">${emoji}</span>${label}`;
            }, 2000);
          }
        };
        
        buttonContainer.appendChild(button);
      });

      // Create Enhance button
      const enhanceButton = document.createElement("div");
      enhanceButton.className = "gpt-dm-button custom";
      setElementStyle(enhanceButton, `
        padding: 3px 8px;
        border-radius: 14px;
        background-color: ${PRIMARY_COLOR};
        color: white;
        cursor: pointer;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 3px;
        line-height: 1;
        font-weight: 500;
      `);
      
      enhanceButton.innerHTML = '<span style="font-size: 12px; margin-right: 2px;">✨</span>Enhance';
      
      enhanceButton.onclick = async () => {
        try {
          const dmInput = document.querySelector('[data-testid="dmComposerTextInput"]');
          if (!dmInput) return;
          
          let currentText = "";
          try {
            currentText = dmInput.innerText || "";
            if (!currentText.trim()) {
              currentText = dmInput.textContent || "";
            }
            if (!currentText.trim()) {
              const spans = dmInput.querySelectorAll('div[data-contents="true"] span[data-text="true"]');
              if (spans.length > 0) {
                currentText = Array.from(spans).map(span => span.textContent || "").join("\n").trim();
              }
            }
          } catch (e) {}
          
          if (!currentText.trim()) {
            alert("Please type some text first to enhance it.");
            return;
          }
          
          const messageHistory = getMessageHistory(10);
          const recipientName = getRecipientName();
          const originalHTML = enhanceButton.innerHTML;
          
          enhanceButton.innerHTML = "⏳";
          enhanceButton.style.opacity = "0.7";
          
          const dmParams = {
            platform: "twitter",
            messageHistory: messageHistory,
            replyStyle: "custom",
            customReply: currentText,
            recipientName: recipientName
          };
          
          const response = await chrome.runtime.sendMessage({
            type: "GENERATE_DM_REPLY",
            dmParams: dmParams
          });
          
          enhanceButton.innerHTML = originalHTML;
          enhanceButton.style.opacity = "1";
          
          if (response && !response.error) {
            const cleanedReply = stripReplyPrefix(response.reply);
            showEnhancementTooltip(enhanceButton, cleanedReply);
          } else if (response && response.error && response.error.type === "credits") {
            alert(response.error.message);
          }
        } catch (error) {
          enhanceButton.innerHTML = "❌";
          setTimeout(() => {
            enhanceButton.innerHTML = '<span style="font-size: 12px; margin-right: 2px;">✨</span>Enhance';
          }, 2000);
        }
      };
      
      buttonContainer.appendChild(enhanceButton);

      // Insert buttons into DM composer
      try {
        const dmLabel = document.querySelector('[data-testid="dmComposerTextInput_label"]');
        if (dmLabel) {
          const richTextContainer = dmLabel.querySelector('[data-testid="dmComposerTextInputRichTextInputContainer"]');
          if (richTextContainer && richTextContainer.parentElement && richTextContainer.parentElement.parentElement) {
            richTextContainer.parentElement.parentElement.insertBefore(buttonContainer, richTextContainer.parentElement);
          } else {
            dmLabel.insertBefore(buttonContainer, dmLabel.firstChild);
          }
        } else {
          const parent = dmContainer.parentElement;
          if (parent && parent.parentElement && parent.parentElement.parentElement) {
            parent.parentElement.parentElement.insertBefore(buttonContainer, parent.parentElement);
          }
        }
      } catch (error) {
        console.error("Error inserting DM buttons:", error);
      }
      
    } catch (error) {
      console.error("Error creating DM buttons:", error);
    }
  }

  // Enhancement Tooltip
  function showEnhancementTooltip(button, enhancedText) {
    const existingTooltip = document.getElementById("gpt-enhanced-tooltip");
    if (existingTooltip) existingTooltip.remove();

    const tooltip = document.createElement("div");
    tooltip.id = "gpt-enhanced-tooltip";
    setElementStyle(tooltip, `
      position: fixed;
      z-index: 9999;
      background-color: white;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 12px;
      width: 350px;
      max-width: min(350px, 90vw);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      color: #0f1419;
    `);

    const buttonRect = button.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const maxWidth = Math.min(350, 0.9 * windowWidth);
    
    let left = buttonRect.left - 50;
    left = Math.max(10, left);
    if (left + maxWidth > windowWidth - 10) {
      left = windowWidth - maxWidth - 10;
    }
    
    tooltip.style.left = `${left}px`;
    
    if (buttonRect.top > 250) {
      tooltip.style.top = (buttonRect.top - 10) + "px";
      tooltip.style.transform = "translateY(-100%)";
    } else {
      tooltip.style.top = `${buttonRect.bottom + 10}px`;
      tooltip.style.transform = "none";
    }

    const content = document.createElement("div");
    
    // Header
    const header = document.createElement("div");
    header.textContent = "Enhanced Text";
    setElementStyle(header, `
      font-weight: 700;
      margin-bottom: 8px;
      font-size: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `);
    
    const closeButton = document.createElement("div");
    closeButton.innerHTML = "&times;";
    closeButton.style.cursor = "pointer";
    closeButton.style.fontSize = "18px";
    closeButton.style.lineHeight = "1";
    closeButton.onclick = () => tooltip.remove();
    header.appendChild(closeButton);
    content.appendChild(header);

    // Enhanced text
    const textDiv = document.createElement("div");
    textDiv.textContent = enhancedText;
    setElementStyle(textDiv, `
      margin-bottom: 10px;
      line-height: 1.4;
      max-height: 150px;
      overflow-y: auto;
      padding: 8px;
      border-radius: 6px;
      background-color: rgba(29, 155, 240, 0.1);
    `);
    content.appendChild(textDiv);

    // Action buttons
    const actions = document.createElement("div");
    setElementStyle(actions, `
      display: flex;
      gap: 8px;
      margin-top: 8px;
      justify-content: flex-end;
    `);

    const copyButton = document.createElement("button");
    copyButton.textContent = "Copy";
    setElementStyle(copyButton, `
      background-color: ${PRIMARY_COLOR};
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 16px;
      font-weight: 500;
      cursor: pointer;
      font-size: 12px;
    `);
    
    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(enhancedText);
        const originalText = copyButton.textContent;
        copyButton.textContent = "Copied!";
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 1500);
      } catch (error) {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = enhancedText;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          
          const originalText = copyButton.textContent;
          copyButton.textContent = "Copied!";
          setTimeout(() => {
            copyButton.textContent = originalText;
          }, 1500);
        } catch (e) {
          alert("Could not copy to clipboard. Please try again.");
        }
      }
    };

    const tryAgainButton = document.createElement("button");
    tryAgainButton.textContent = "Try Again";
    setElementStyle(tryAgainButton, `
      background-color: transparent;
      color: ${PRIMARY_COLOR};
      border: 1px solid ${PRIMARY_COLOR};
      padding: 5px 10px;
      border-radius: 16px;
      font-weight: 500;
      cursor: pointer;
      font-size: 12px;
    `);
    
    tryAgainButton.onclick = () => {
      tooltip.remove();
      button.click();
    };

    actions.appendChild(copyButton);
    actions.appendChild(tryAgainButton);
    content.appendChild(actions);
    tooltip.appendChild(content);
    document.body.appendChild(tooltip);

    // Auto-close on outside click
    const clickHandler = (event) => {
      if (!tooltip.contains(event.target) && event.target !== button) {
        tooltip.remove();
        document.removeEventListener("click", clickHandler);
      }
    };
    
    setTimeout(() => {
      document.addEventListener("click", clickHandler);
    }, 100);
  }

  // Main initialization
  function initialize() {
    // Check if we're on DM page
    if (isDMComposer()) {
      createDMButtons();
      
      // Set up observers for DM page changes
      const observer = new MutationObserver((mutations) => {
        if (!document.getElementById("GPT_DM_BUTTONS")) {
          createDMButtons();
        }
      });
      
      const mainElement = document.querySelector('main[role="main"]') || 
                        document.querySelector('div[data-testid="primaryColumn"]') || 
                        document.body;
      
      if (mainElement) {
        observer.observe(mainElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-conversation-id", "data-testid"]
        });
      }
      
      // Periodic check for DM buttons
      setInterval(() => {
        if (isDMComposer() && !document.getElementById("GPT_DM_BUTTONS")) {
          createDMButtons();
        }
      }, 5000);
    }
  }

  // Start initialization after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

  // Also initialize after a delay to catch dynamic content
  setTimeout(initialize, 2000);

})();
