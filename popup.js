document.addEventListener('DOMContentLoaded', () => {
  const summarizeButton = document.getElementById('summarize');
  const statusDiv = document.getElementById('status');

  // Set up PDF.js worker for PDF processing
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

  // Disable the button initially
  summarizeButton.disabled = true;
  
  // Current content state
  let contentState = {
    url: null,
    isPDF: false,
    tabId: null
  };

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
        // For webpages, extract content using the content script
        contentText = await processWebpageContent();
      }
      
      console.log("[Popup] Content extracted, length:", contentText.length);
      console.log("[Popup] Content preview:", contentText.substring(0, 500) + "...");
      
      // Summarize the content
      const summary = await summarizeContent(contentText);
      
      // Display the summary
      showStatus('Summary completed!', 'success');
      displaySummary(summary);
      
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
    
    if (!response || response.status !== "success") {
      throw new Error(response?.message || "Failed to summarize content");
    }
    
    return response.summary;
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

function displaySummary(summary) {
  // Create a modal to display the summary
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 80%;
    max-height: 80%;
    overflow-y: auto;
  `;
  
  content.innerHTML = `
    <h3>Content Summary</h3>
    <p>${summary}</p>
    <button id="close-summary" style="
      padding: 8px 16px;
      background-color: #0060df;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 15px;
    ">Close</button>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  document.getElementById('close-summary').addEventListener('click', () => {
    modal.remove();
  });
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