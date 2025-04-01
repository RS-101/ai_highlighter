// Global state for content
let contentState = {
  url: null,
  isPDF: false,
  tabId: null
};

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
        contentText = await processPDFContent(contentState.url);
      } else {
        // For webpages, get the already extracted content
        contentText = await processWebpageContent();
      }
      
      console.log("[Popup] Content extracted, length:", contentText.length);
      
      // Summarize the content
      const analysisResult = await summarizeContent(contentText);
      
      // Display the summary and highlights
      showStatus('Summary completed!', 'success');
      displaySummaryAndHighlights(analysisResult, contentState.isPDF);
      
      // Apply highlights if it's a webpage
      if (!contentState.isPDF) {
        applyWebpageHighlights(analysisResult.highlights);
      }
      
    } catch (error) {
      console.error('[Popup] Error:', error);
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
    return extractTextFromPdf(pdfArrayBuffer);
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
    const response = await browser.runtime.sendMessage({
      type: "SUMMARIZE_CONTENT",
      text: text
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