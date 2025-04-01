console.log("[Content] Content script loaded on:", window.location.href);

// Variables to store highlights
let highlights = [];
let highlightsApplied = false;
let highlightedElements = [];

// Listen for messages from the background script or popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content] Received message:', message);
  
  if (message.type === "EXTRACT_WEBPAGE_CONTENT") {
    try {
      const pageContent = extractPageContent();
      console.log('[Content] Extracted page content length:', pageContent.length);
      sendResponse({ 
        status: "success", 
        content: pageContent 
      });
    } catch (error) {
      console.error('[Content] Error extracting content:', error);
      sendResponse({ 
        status: "error", 
        message: error.message 
      });
    }
  }
  
  if (message.type === "APPLY_HIGHLIGHTS") {
    try {
      highlights = message.highlights || [];
      applyHighlights();
      sendResponse({ 
        status: "success", 
        highlightsApplied: true,
        count: highlights.length
      });
    } catch (error) {
      console.error('[Content] Error applying highlights:', error);
      sendResponse({ 
        status: "error", 
        message: error.message 
      });
    }
  }
  
  if (message.type === "TOGGLE_HIGHLIGHTS") {
    try {
      if (highlightsApplied) {
        removeHighlights();
      } else {
        applyHighlights();
      }
      sendResponse({ 
        status: "success", 
        highlightsApplied: highlightsApplied
      });
    } catch (error) {
      console.error('[Content] Error toggling highlights:', error);
      sendResponse({ 
        status: "error", 
        message: error.message 
      });
    }
  }
  
  return true; // Keep the message channel open for async response
});

// Function to extract readable content from the webpage
function extractPageContent() {
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
    
    return extractedText;
  } catch (error) {
    console.error('[Content] Error during extraction:', error);
    throw new Error('Failed to extract webpage content: ' + error.message);
  }
}

// Function to apply highlights to the webpage
function applyHighlights() {
  if (!highlights || !highlights.length) {
    console.log('[Content] No highlights to apply');
    return;
  }
  
  console.log('[Content] Applying highlights:', highlights);
  
  // Remove any existing highlights first
  removeHighlights();
  
  // For each highlight, find and wrap matching text
  highlights.forEach((highlightText, index) => {
    // Use recursion to find all instances
    findAndHighlightText(document.body, highlightText, index);
  });
  
  // Show a notification that highlights were applied
  showHighlightNotification(highlights.length);
  
  highlightsApplied = true;
}

// Function to find and highlight text in the DOM
function findAndHighlightText(element, searchText, index) {
  if (!element) return;
  
  // Skip script and style elements
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || 
      element.tagName === 'NOSCRIPT' || element.className === 'ai-highlight') {
    return;
  }
  
  // Check if this element only contains text
  if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
    const text = element.textContent;
    if (text.includes(searchText)) {
      // Found the text, wrap it in a highlighted span
      const regex = new RegExp(escapeRegExp(searchText), 'g');
      element.innerHTML = element.innerHTML.replace(regex, 
        `<mark class="ai-highlight ai-highlight-${index}" style="background-color: #ffff99; padding: 2px; border-radius: 2px;">$&</mark>`
      );
      
      // Track this element
      highlightedElements.push(element);
      return;
    }
  }
  
  // Recurse through child elements
  Array.from(element.childNodes).forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      findAndHighlightText(child, searchText, index);
    }
  });
}

// Function to remove highlights
function removeHighlights() {
  console.log('[Content] Removing highlights');
  
  // Find all highlight elements and remove them
  const highlights = document.querySelectorAll('.ai-highlight');
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    }
  });
  
  // Handle elements we modified
  highlightedElements.forEach(element => {
    // Remove any remaining highlights with a proper DOM replacement
    const highlightMarks = element.querySelectorAll('.ai-highlight');
    if (highlightMarks.length > 0) {
      highlightMarks.forEach(mark => {
        mark.outerHTML = mark.innerHTML;
      });
    }
  });
  
  // Reset the tracking arrays
  highlightedElements = [];
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