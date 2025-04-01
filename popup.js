// Global state for content
let contentState = {
  url: null,
  isPDF: false,
  tabId: null
};

// Show API loading indicator
function showApiLoadingIndicator(message = "Analyzing content...") {
  const existingOverlay = document.querySelector('.api-loading-overlay');
  if (existingOverlay) return existingOverlay;
  
  const overlay = document.createElement('div');
  overlay.className = 'api-loading-overlay';
  overlay.innerHTML = `
    <div class="api-loading-spinner"></div>
    <div class="api-loading-text">${message}</div>
    <div class="api-loading-progress">
      <div class="api-loading-progress-bar"></div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  return overlay;
}

// Hide API loading indicator
function hideApiLoadingIndicator() {
  const overlay = document.querySelector('.api-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease-out';
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const summarizeButton = document.getElementById('summarize');
  const statusDiv = document.getElementById('status');

  // Set up PDF.js worker for PDF processing
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

  // Disable the button initially
  summarizeButton.disabled = true;
  
  // Check what content is currently open
  browser.runtime.sendMessage({ type: "GET_CURRENT_CONTENT" })
    .then(response => {
      console.log("[Popup] Response from background:", response);
      
      if (response && response.status === "success") {
        // Store the content state
        contentState = {
          url: response.url,
          isPDF: response.isPDF,
          tabId: response.tabId
        };
        
        // Enable the button and update UI based on content type
        summarizeButton.disabled = false;
        summarizeButton.textContent = contentState.isPDF ? 
          "Summarize PDF" : "Summarize Page";
          
        // If we have a cached summary, display it immediately
        if (response.hasCachedSummary && response.summary && response.highlights) {
          console.log("[Popup] Using cached summary from background");
          
          // Create analysis result from cached data
          const analysisResult = {
            summary: response.summary,
            highlights: response.highlights
          };
          
          // Display the summary and highlights
          showStatus('Showing cached summary', 'success');
          displaySummaryAndHighlights(analysisResult, contentState.isPDF);
          
          // Show time since generation
          const timeAgo = getTimeAgo(response.timestamp);
          showTimestamp(timeAgo);
          
          // Apply highlights if it's a webpage (they might have been removed)
          if (!contentState.isPDF) {
            applyWebpageHighlights(analysisResult.highlights);
          }
        }
      } else {
        showStatus('No content detected. Please open a page or PDF first.', 'error');
      }
    })
    .catch(error => {
      console.error('[Popup] Error checking content:', error);
      showStatus('Error connecting to extension: ' + error.message, 'error');
    });

  summarizeButton.addEventListener('click', async () => {
    try {
      // Update button state
      summarizeButton.disabled = true;
      summarizeButton.innerHTML = '<span class="loading"></span> Processing...';
      showStatus('Processing content...', 'success');
      
      let contentText = '';
      
      // Handle different content types
      if (contentState.isPDF) {
        // For PDFs, fetch the content and extract text using PDF.js
        showApiLoadingIndicator('Extracting PDF content...');
        contentText = await processPDFContent(contentState.url);
      } else {
        // For webpages, get the already extracted content
        showApiLoadingIndicator('Getting webpage content...');
        contentText = await processWebpageContent();
      }
      
      console.log("[Popup] Content extracted, length:", contentText.length);
      
      // Update loading message for summarization
      showApiLoadingIndicator('Generating summary and highlights...');
      
      // Summarize the content
      const analysisResult = await summarizeContent(contentText);
      
      // Hide loading indicator
      hideApiLoadingIndicator();
      
      // Display the summary and highlights
      showStatus('Summary completed!', 'success');
      displaySummaryAndHighlights(analysisResult, contentState.isPDF);
      
      // Apply highlights if it's a webpage
      if (!contentState.isPDF) {
        applyWebpageHighlights(analysisResult.highlights);
      }
      
    } catch (error) {
      console.error('[Popup] Error:', error);
      hideApiLoadingIndicator();
      showStatus('Failed to process content: ' + error.message, 'error');
    } finally {
      // Re-enable the button
      summarizeButton.disabled = false;
      summarizeButton.innerHTML = contentState.isPDF ? 
        "Summarize PDF" : "Summarize Page";
    }
  });
  
  // Process PDF content using PDF.js
  async function processPDFContent(url) {
    // Request PDF URL from background
    const response = await browser.runtime.sendMessage({ 
      type: "GET_CURRENT_CONTENT"
    });
    
    console.log("[Popup] PDF content response:", response);
    
    if (!response || response.status !== "success" || !response.isPDF) {
      throw new Error(response?.message || "Failed to get PDF content");
    }
    
    // Fetch the PDF directly and process it
    const pdfResponse = await fetch(response.url);
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    console.log("[Popup] PDF data received:", pdfArrayBuffer.byteLength, "bytes");
    
    // Extract text from PDF
    const fullText = await extractTextFromPdf(pdfArrayBuffer);
    
    // Limit text to 2300 characters
    return limitContentSize(fullText, 2300);
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
    console.log(`[Popup] Limited content from ${text.length} to ${limitedContent.length} characters`);
    
    return limitedContent;
  }
  
  // Process webpage content using content script
  async function processWebpageContent() {
    const response = await browser.runtime.sendMessage({ 
      type: "EXTRACT_WEBPAGE_CONTENT"
    });
    
    console.log("[Popup] Webpage content response:", response);
    
    if (!response || response.status !== "success") {
      throw new Error(response?.message || "Failed to extract webpage content");
    }
    
    return response.content;
  }
  
  // Summarize content using the background script
  async function summarizeContent(text) {
    // Ensure content is limited to 2300 characters
    const limitedText = limitContentSize(text, 2300);
    
    const response = await browser.runtime.sendMessage({
      type: "SUMMARIZE_CONTENT",
      text: limitedText,
      url: contentState.url // Include the current URL for caching
    });
    
    console.log("[Popup] Summarization response:", response);
    
    if (!response || response.status !== "success" || !response.summary) {
      throw new Error(response?.message || "Failed to summarize content");
    }
    
    return response.summary;
  }
  
  // Apply highlights to the webpage
  function applyWebpageHighlights(highlights) {
    if (!highlights || !highlights.length) {
      console.log("[Popup] No highlights to apply");
      return;
    }
    
    // Send message to content script to apply highlights
    browser.tabs.sendMessage(contentState.tabId, {
      type: "APPLY_HIGHLIGHTS",
      highlights: highlights
    }).then(response => {
      console.log("[Popup] Highlights applied:", response);
      
      // Apply highlights again after a short delay to ensure complete coverage
      setTimeout(() => {
        console.log("[Popup] Re-applying highlights to ensure complete coverage");
        browser.tabs.sendMessage(contentState.tabId, {
          type: "APPLY_HIGHLIGHTS",
          highlights: highlights,
          showNotification: false
        }).catch(error => {
          console.error("[Popup] Error during second highlight application:", error);
        });
      }, 1500);
    }).catch(error => {
      console.error("[Popup] Error applying highlights:", error);
    });
  }
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // Hide the status message after 5 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

function displaySummaryAndHighlights(analysis, isPDF) {
  // Clear previous content
  const contentContainer = document.getElementById('content-container');
  contentContainer.innerHTML = '';
  
  // Hide the main container
  document.getElementById('main-container').style.display = 'none';
  
  // Create content
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 10px 0;
    width: 100%;
  `;
  
  // Create HTML for highlights
  let highlightsHTML = '';
  if (analysis.highlights && analysis.highlights.length) {
    highlightsHTML = `
      <h4>Key Highlights:</h4>
      <ul style="padding-left: 20px;">
        ${analysis.highlights.map(highlight => 
          `<li style="margin-bottom: 8px; color: #0060df;">${highlight}</li>`
        ).join('')}
      </ul>
    `;
  }
  
  // Show PDF-specific message
  let pdfMessage = '';
  if (isPDF) {
    pdfMessage = `
      <div style="margin-top: 15px; padding: 10px; background-color: #f0f0f0; border-radius: 4px;">
        <strong>Note:</strong> PDF highlighting is not available directly in the document. 
        The key passages are listed above.
      </div>
    `;
  }
  
  content.innerHTML = `
    <h3>Content Summary</h3>
    <p style="line-height: 1.5;">${analysis.summary}</p>
    
    ${highlightsHTML}
    ${pdfMessage}
    
    <div style="display: flex; justify-content: space-between; margin-top: 15px;">
      <button id="back-button" style="
        padding: 8px 16px;
        background-color: #0060df;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Back</button>
      
      ${!isPDF ? `
      <button id="toggle-highlights" style="
        padding: 8px 16px;
        background-color: #45a049;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Toggle Highlights</button>
      ` : ''}
    </div>
  `;
  
  contentContainer.appendChild(content);
  
  // Resize popup window to fit content
  setTimeout(() => {
    const newHeight = document.body.scrollHeight;
    const newWidth = Math.min(600, Math.max(300, document.body.scrollWidth));
    
    browser.runtime.sendMessage({ 
      type: "RESIZE_POPUP", 
      width: newWidth,
      height: newHeight
    }).catch(err => console.error("[Popup] Error resizing popup:", err));
  }, 50);
  
  // Add event listeners to buttons
  document.getElementById('back-button').addEventListener('click', () => {
    contentContainer.innerHTML = '';
    document.getElementById('main-container').style.display = 'flex';
    
    // Resize back to default
    browser.runtime.sendMessage({ 
      type: "RESIZE_POPUP", 
      width: 300,
      height: 200
    }).catch(err => console.error("[Popup] Error resizing popup:", err));
  });
  
  // Add toggle highlights button for webpages
  if (!isPDF) {
    document.getElementById('toggle-highlights').addEventListener('click', () => {
      browser.tabs.sendMessage(contentState.tabId, {
        type: "TOGGLE_HIGHLIGHTS"
      }).catch(error => {
        console.error("[Popup] Error toggling highlights:", error);
      });
    });
  }
}

// Function to extract text from a PDF using PDF.js
async function extractTextFromPdf(arrayBuffer) {
  try {
    console.log("[Popup] Starting PDF extraction with PDF.js");
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    console.log("[Popup] PDF document loaded with", pdf.numPages, "pages");
    
    let fullText = '';
    
    // Iterate through each page
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log("[Popup] Processing page", i);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Extract text from the page
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    console.log("[Popup] PDF text extraction complete");
    return fullText;
  } catch (error) {
    console.error("[Popup] Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF: " + error.message);
  }
}

// Get a human-readable time ago string
function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);
  
  if (seconds < 60) {
    return 'just now';
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

// Show timestamp in the summary view
function showTimestamp(timeAgo) {
  setTimeout(() => {
    // Create timestamp element
    const timestampElement = document.createElement('div');
    timestampElement.className = 'cached-info';
    
    // Create refresh button
    const refreshButton = document.createElement('button');
    refreshButton.className = 'refresh-button';
    refreshButton.textContent = 'Refresh';
    refreshButton.onclick = async (e) => {
      e.preventDefault();
      
      // Hide the timestamp and button
      timestampElement.style.display = 'none';
      
      // Trigger the summarize button click
      document.getElementById('summarize').click();
    };
    
    // Create timestamp text
    const timestampText = document.createElement('span');
    timestampText.textContent = `Summary generated ${timeAgo}`;
    
    // Add elements to timestamp container
    timestampElement.appendChild(timestampText);
    timestampElement.appendChild(refreshButton);
    
    // Add to the summary container
    const content = document.querySelector('#content-container > div');
    if (content) {
      // Insert at the top of the content
      if (content.firstChild) {
        content.insertBefore(timestampElement, content.firstChild);
      } else {
        content.appendChild(timestampElement);
      }
    }
  }, 100);
} 