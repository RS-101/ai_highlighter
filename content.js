console.log("[Content] Content script loaded on:", window.location.href);

// Global state for highlights
let highlights = [];
let highlightsApplied = false;
let highlightedElements = new Set();
let contentProcessed = false;

// Add highlight styles to the page
function addHighlightStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .ai-highlight {
      background-color: #ffeb3b;
      padding: 2px 0;
      border-radius: 2px;
    }
    .ai-loading-overlay {
      position: fixed;
      top: 10px;
      right: 10px;
      background-color: rgba(0, 96, 223, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      font-family: Arial, sans-serif;
      animation: ai-fade-in 0.3s ease-in-out;
    }
    .ai-loading-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: ai-spin 1s ease-in-out infinite;
      margin-right: 10px;
    }
    @keyframes ai-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ai-fade-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// Show loading indicator when API is being called
function showLoadingIndicator() {
  // Check if loading indicator already exists
  if (document.querySelector('.ai-loading-overlay')) return;
  
  const loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'ai-loading-overlay';
  
  // Create spinner
  const spinner = document.createElement('div');
  spinner.className = 'ai-loading-spinner';
  loadingIndicator.appendChild(spinner);
  
  // Create text
  const text = document.createElement('div');
  text.textContent = 'Processing page content...';
  loadingIndicator.appendChild(text);
  
  document.body.appendChild(loadingIndicator);
  
  return loadingIndicator;
}

// Hide loading indicator
function hideLoadingIndicator() {
  const loadingIndicator = document.querySelector('.ai-loading-overlay');
  if (loadingIndicator) {
    loadingIndicator.style.animation = 'ai-fade-in 0.3s ease-in-out reverse';
    setTimeout(() => {
      if (loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }
    }, 300);
  }
}

// Initialize the extension
function initializeExtension() {
  if (contentProcessed) return; // Prevent multiple initializations
  
  console.log("[Content] Initializing extension...");
  addHighlightStyles();
  
  // First check if this site should be auto-summarized
  browser.runtime.sendMessage({
    type: "CHECK_AUTO_SUMMARIZE",
    url: window.location.href
  }).then(response => {
    console.log("[Content] Auto-summarize check response:", response);
    
    // Only proceed with auto-summarization if enabled for this site
    if (response && response.status === "success" && response.shouldAutoSummarize) {
      // Extract content immediately and send to background for processing
      extractPageContent()
        .then(content => {
          console.log("[Content] Content extracted, length:", content.length);
          // Store the full content for later use
          window.pageContent = content;
          contentProcessed = true;
          
          // Show loading indicator while API is being called
          const loadingIndicator = showLoadingIndicator();
          
          // Limit content to 2300 characters for the API
          const limitedContent = limitContentSize(content, 2300);
          console.log("[Content] Limited content for API, new length:", limitedContent.length);
          
          // Send the content to the background script for automatic processing
          return browser.runtime.sendMessage({
            type: "AUTO_PROCESS_CONTENT",
            content: limitedContent,
            url: window.location.href,
            pageTitle: document.title
          });
        })
        .then(response => {
          console.log("[Content] Auto-processing response:", response);
          // Hide loading indicator
          hideLoadingIndicator();
          
          // Only apply highlights if the response was successful
          if (response && response.status === "success" && response.summary && response.summary.highlights) {
            // Store highlights for later reuse
            highlights = response.summary.highlights;
            
            // Apply highlights immediately
            return applyHighlights(response.summary.highlights).then(() => {
              // Apply highlights again after a short delay to catch any late-loading content
              setTimeout(() => {
                console.log("[Content] Re-applying highlights to ensure complete coverage");
                applyHighlights(response.summary.highlights, false);
              }, 1500);
            });
          } else if (response && response.status === "skip") {
            console.log("[Content] Auto-summarization skipped:", response.message);
          }
        })
        .catch(error => {
          console.error("[Content] Error in auto-processing:", error);
          hideLoadingIndicator();
        });
    } else {
      console.log("[Content] Auto-summarization not enabled for this site");
      // Still extract and store the content for manual summarization
      extractPageContent()
        .then(content => {
          window.pageContent = content;
          contentProcessed = true;
          console.log("[Content] Content extracted and stored for manual summarization");
        })
        .catch(error => {
          console.error("[Content] Error extracting content:", error);
        });
    }
  }).catch(error => {
    console.error("[Content] Error checking auto-summarize settings:", error);
    // Continue with content extraction for manual summarization
    extractPageContent()
      .then(content => {
        window.pageContent = content;
        contentProcessed = true;
      })
      .catch(error => {
        console.error("[Content] Error extracting content:", error);
      });
  });
}

// Function to limit content size while preserving complete sentences
function limitContentSize(text, maxLength) {
  if (text.length <= maxLength) return text;
  
  // Find a good cutoff point (end of sentence) near the maxLength
  let cutoff = maxLength;
  
  // Look for sentence endings (.!?) near the maxLength
  const sentenceEndRegex = /[.!?]\s+/g;
  let match;
  let lastGoodCutoff = 0;
  
  while ((match = sentenceEndRegex.exec(text)) !== null) {
    if (match.index > maxLength) break;
    lastGoodCutoff = match.index + match[0].length - 1;
  }
  
  // If we found a good sentence ending, use that, otherwise just cut at maxLength
  cutoff = lastGoodCutoff > 0 ? lastGoodCutoff + 1 : maxLength;
  
  const limitedContent = text.substring(0, cutoff);
  console.log(`[Content] Limited content from ${text.length} to ${limitedContent.length} characters`);
  
  return limitedContent;
}

// Initialize as soon as possible based on document readiness
if (document.readyState === 'loading') {
  // Document still loading, wait for it to be ready
  console.log("[Content] Document still loading, waiting for DOMContentLoaded...");
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  // Document already loaded, initialize immediately
  console.log("[Content] Document already loaded, initializing immediately...");
  initializeExtension();
}

// Listen for messages from background script or popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Content] Received message:", message);
  
  switch (message.type) {
    case "EXTRACT_WEBPAGE_CONTENT":
      // Return the stored content if available, otherwise extract it
      if (window.pageContent) {
        // Limit content to 2300 characters
        const limitedContent = limitContentSize(window.pageContent, 2300);
        
        sendResponse({
          status: "success",
          content: limitedContent
        });
      } else {
        extractPageContent()
          .then(content => {
            // Store full content
            window.pageContent = content;
            
            // Limit to 2300 characters
            const limitedContent = limitContentSize(content, 2300);
            
            sendResponse({
              status: "success",
              content: limitedContent
            });
          })
          .catch(error => {
            console.error("[Content] Error extracting content:", error);
            sendResponse({
              status: "error",
              message: error.message
            });
          });
        return true; // Keep the message channel open for async response
      }
      break;
      
    case "APPLY_HIGHLIGHTS":
      // Apply new highlights, respecting the showNotification parameter
      const showNotification = message.showNotification !== false; // Default to true if not specified
      applyHighlights(message.highlights, showNotification).then(response => {
        sendResponse(response);
      }).catch(error => {
        console.error("[Content] Error applying highlights:", error);
        sendResponse({
          status: "error",
          message: error.message
        });
      });
      return true;
      
    case "TOGGLE_HIGHLIGHTS":
      // Toggle highlights visibility
      if (highlightsApplied) {
        removeHighlights();
      } else {
        applyHighlights(highlights);
      }
      sendResponse({ status: "success" });
      break;
  }
});

// Function to extract readable content from the webpage
async function extractPageContent() {
  console.log('[Content] Extracting page content...');
  
  try {
    // Get the document title
    const title = document.title || '';
    
    // Try to find the main content of the page
    // First looking for main content elements
    const mainElements = [
      document.querySelector('main'),
      document.querySelector('article'),
      document.querySelector('.main-content'),
      document.querySelector('#content'),
      document.querySelector('.content'),
      document.querySelector('.article'),
      document.querySelector('.post')
    ].filter(Boolean); // Filter out null elements
    
    let content = '';
    
    // If we found main content elements, extract text from them
    if (mainElements.length > 0) {
      console.log('[Content] Found main content elements:', mainElements.length);
      content = mainElements.map(element => element.innerText).join('\n\n');
    } else {
      // Otherwise, try to extract the body text while ignoring navigation, sidebars, etc.
      const body = document.body;
      
      // Elements to exclude (common navigation, header, footer, sidebar elements)
      const excludeSelectors = [
        'nav', 'header', 'footer', 'aside', 
        '.nav', '.navigation', '.menu', '.sidebar', 
        '.header', '.footer', '.comments',
        '#nav', '#navigation', '#menu', '#sidebar', 
        '#header', '#footer', '#comments'
      ];
      
      // Create a document fragment to clone the body content
      const clone = body.cloneNode(true);
      
      // Remove unwanted elements from the clone
      excludeSelectors.forEach(selector => {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
      
      // Get the cleaned text
      content = clone.innerText;
    }
    
    // Clean up the content 
    content = content
      .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n\n')  // Replace multiple newlines with double newlines
      .trim();  // Trim whitespace from start and end
    
    // Create the final text with title and content
    const extractedText = `Title: ${title}\n\n${content}`;
    console.log('[Content] Extraction complete, text length:', extractedText.length);
    
    return Promise.resolve(extractedText);
  } catch (error) {
    console.error('[Content] Error during extraction:', error);
    return Promise.reject(new Error('Failed to extract webpage content: ' + error.message));
  }
}

// Function to apply highlights to the webpage
function applyHighlights(newHighlights, showNotification = true) {
  if (!newHighlights || !newHighlights.length) {
    console.log('[Content] No highlights to apply');
    return Promise.resolve({
      status: "success",
      highlightsApplied: false,
      count: 0
    });
  }
  
  console.log('[Content] Applying highlights:', newHighlights);
  
  // Remove any existing highlights first
  removeHighlights();
  
  // Preprocess highlights to escape regex special characters and sort by length (longest first)
  const processedHighlights = newHighlights
    .map(text => ({ 
      text, 
      regex: new RegExp(escapeRegExp(text), 'gi') 
    }))
    .sort((a, b) => b.text.length - a.text.length); // Sort by length, longest first
  
  // Use a better approach to find and highlight text
  findAndHighlightInPage(processedHighlights);
  
  // Show a notification that highlights were applied, only if requested
  if (showNotification) {
    showHighlightNotification(newHighlights.length);
  }
  
  highlights = newHighlights;
  highlightsApplied = true;
  
  return Promise.resolve({
    status: "success",
    highlightsApplied: true,
    count: newHighlights.length
  });
}

// Improved method to find and highlight text throughout the page
function findAndHighlightInPage(processedHighlights) {
  // Get all text nodes in the document
  const textNodes = getAllTextNodes(document.body);
  console.log(`[Content] Found ${textNodes.length} text nodes to search`);
  
  // For each highlight, search across all text nodes
  processedHighlights.forEach((highlight, highlightIndex) => {
    console.log(`[Content] Searching for highlight: "${highlight.text.substring(0, 30)}..."`);
    
    let foundCount = 0;
    let textContent = '';
    
    // Step 1: Group text nodes by their parent element to handle text that spans across nodes
    const nodeGroups = groupTextNodesByParent(textNodes);
    
    nodeGroups.forEach(group => {
      // Combine text from all nodes in the group
      const combinedText = group.nodes.map(node => node.nodeValue).join('');
      
      // Find all matches in the combined text
      const matches = [...combinedText.matchAll(highlight.regex)];
      
      if (matches.length) {
        console.log(`[Content] Found ${matches.length} matches in a node group`);
        foundCount += matches.length;
        
        // Replace text in a safer way using DOM methods
        const fragment = document.createDocumentFragment();
        
        // Use a safe text replacement approach
        const parts = combinedText.split(highlight.regex);
        const matchedTexts = combinedText.match(highlight.regex) || [];
        
        for (let i = 0; i < parts.length; i++) {
          // Add regular text
          if (parts[i]) {
            fragment.appendChild(document.createTextNode(parts[i]));
          }
          
          // Add highlighted match
          if (i < matchedTexts.length) {
            const mark = document.createElement('mark');
            mark.className = `ai-highlight ai-highlight-${highlightIndex}`;
            mark.setAttribute('data-highlight-index', highlightIndex);
            mark.textContent = matchedTexts[i];
            fragment.appendChild(mark);
          }
        }
        
        // Replace old nodes with new marked-up content
        const parentNode = group.parent;
        group.nodes.forEach(node => parentNode.removeChild(node));
        parentNode.appendChild(fragment);
        
        // Track this for future cleanup
        highlightedElements.add(parentNode);
      }
    });
    
    console.log(`[Content] Highlighted ${foundCount} instances of "${highlight.text.substring(0, 30)}..."`);
  });

  // Final pass to handle advanced cases: search for matches in the whole HTML
  const container = document.body;
  
  // Find text that might span multiple elements using a custom walker
  processedHighlights.forEach((highlight, highlightIndex) => {
    // Create a TreeWalker to iterate through the DOM
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already highlighted content
          if (isSkippableNode(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    let currentNode = walker.nextNode();
    while (currentNode) {
      const parent = currentNode.parentNode;
      
      // Skip if this node is already part of a highlight
      if (parent.classList && parent.classList.contains('ai-highlight')) {
        currentNode = walker.nextNode();
        continue;
      }
      
      // Check if this text contains our highlight
      if (highlight.regex.test(currentNode.nodeValue)) {
        const original = currentNode.nodeValue;
        
        // Create fragment for the highlighted content
        const fragment = document.createDocumentFragment();
        
        // Use same approach as before - split by regex
        const parts = original.split(highlight.regex);
        const matchedTexts = original.match(highlight.regex) || [];
        
        for (let i = 0; i < parts.length; i++) {
          // Add regular text
          if (parts[i]) {
            fragment.appendChild(document.createTextNode(parts[i]));
          }
          
          // Add highlighted match
          if (i < matchedTexts.length) {
            const mark = document.createElement('mark');
            mark.className = `ai-highlight ai-highlight-${highlightIndex}`;
            mark.setAttribute('data-highlight-index', highlightIndex);
            mark.textContent = matchedTexts[i];
            fragment.appendChild(mark);
          }
        }
        
        // Replace the original text node with our fragment
        const tempSpan = document.createElement('span');
        tempSpan.appendChild(fragment);
        parent.replaceChild(tempSpan, currentNode);
        highlightedElements.add(tempSpan);
        
        // Update the current node
        currentNode = walker.nextNode();
      } else {
        currentNode = walker.nextNode();
      }
    }
  });
}

// Function to get all text nodes in an element
function getAllTextNodes(element) {
  if (!element) return [];
  
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip empty text nodes and nodes in scripts, styles, etc.
        if (isSkippableNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  let currentNode;
  while (currentNode = walker.nextNode()) {
    textNodes.push(currentNode);
  }
  
  return textNodes;
}

// Check if a node should be skipped for highlighting
function isSkippableNode(node) {
  if (!node || node.nodeValue.trim() === '') return true;
  
  const parent = node.parentNode;
  if (!parent) return true;
  
  // Skip script and style elements
  const tagName = parent.tagName && parent.tagName.toLowerCase();
  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
    return true;
  }
  
  // Skip if it's already highlighted
  if (parent.classList && parent.classList.contains('ai-highlight')) {
    return true;
  }
  
  return false;
}

// Group text nodes by their parent element
function groupTextNodesByParent(textNodes) {
  const groups = [];
  const nodesByParent = {};
  
  // Group nodes by parent
  textNodes.forEach(node => {
    const parentNode = node.parentNode;
    if (!parentNode) return;
    
    const parentId = parentNode.getAttribute('data-parent-id') || 
                    `parent-${Math.random().toString(36).substr(2, 9)}`;
    
    if (!parentNode.hasAttribute('data-parent-id')) {
      parentNode.setAttribute('data-parent-id', parentId);
    }
    
    if (!nodesByParent[parentId]) {
      nodesByParent[parentId] = {
        parent: parentNode,
        nodes: []
      };
    }
    
    nodesByParent[parentId].nodes.push(node);
  });
  
  // Convert object to array
  for (let id in nodesByParent) {
    groups.push(nodesByParent[id]);
  }
  
  return groups;
}

// Function to remove highlights
function removeHighlights() {
  console.log('[Content] Removing highlights');
  
  // Find all highlight elements and remove them
  const highlightElements = document.querySelectorAll('.ai-highlight');
  highlightElements.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    }
  });
  
  // Clean up any temporary attributes we added
  document.querySelectorAll('[data-parent-id]').forEach(el => {
    el.removeAttribute('data-parent-id');
  });
  
  // Reset tracked elements
  highlightedElements.clear();
  highlightsApplied = false;
}

// Show a notification about highlights
function showHighlightNotification(count) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #0060df;
    color: white;
    padding: 10px 15px;
    border-radius: 4px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  notification.textContent = `${count} important passages highlighted`;
  
  document.body.appendChild(notification);
  
  // Remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

// Helper function to escape special characters in a string for use in a regular expression
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
} 