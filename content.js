console.log("[Content] Content script loaded on:", window.location.href);

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