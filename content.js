// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "processPDF") {
    processPDF();
  }
});

async function processPDF() {
  try {
    // Wait for PDF.js to load the document
    await waitForPDFLoad();
    
    // Extract text from PDF
    const text = await extractPDFText();
    
    // Send text to background script for summarization
    const response = await browser.runtime.sendMessage({
      action: "summarizePDF",
      text: text
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Display summary
    displaySummary(response.summary);
  } catch (error) {
    console.error('Error processing PDF:', error);
    displayError('Failed to process PDF');
  }
}

function waitForPDFLoad() {
  return new Promise((resolve) => {
    // Check if PDF.js is already loaded
    if (document.querySelector('.pdfViewer')) {
      resolve();
    } else {
      // Wait for PDF.js to load
      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector('.pdfViewer')) {
          obs.disconnect();
          resolve();
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  });
}

async function extractPDFText() {
  // This is a placeholder for actual PDF text extraction
  // You would need to implement the actual text extraction logic
  // This might involve using PDF.js's API or other PDF parsing libraries
  const text = '';
  return text;
}

function displaySummary(summary) {
  // Create and show summary overlay
  const overlay = document.createElement('div');
  overlay.id = 'pdf-summary-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 300px;
    max-height: 80vh;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 10000;
    overflow-y: auto;
  `;
  
  overlay.innerHTML = `
    <h3 style="margin-top: 0;">PDF Summary</h3>
    <p>${summary}</p>
    <button onclick="this.parentElement.remove()" style="
      position: absolute;
      top: 10px;
      right: 10px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 20px;
    ">×</button>
  `;
  
  document.body.appendChild(overlay);
}

function displayError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 15px;
    border-radius: 8px;
    z-index: 10000;
  `;
  
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  
  // Remove error message after 5 seconds
  setTimeout(() => errorDiv.remove(), 5000);
} 