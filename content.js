// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  if (message.action === "processPDF") {
    processPDF().then(sendResponse).catch(error => {
      console.error('Error processing PDF:', error);
      sendResponse({ error: error.message });
    });
    return true; // Will respond asynchronously
  }
});

async function processPDF() {
  try {
    console.log('Starting PDF processing...');
    
    // Get the PDF file as Uint8Array
    const pdfData = await getPDFAsUint8Array();
    console.log('PDF data loaded, length:', pdfData.length);
    
    // Extract text from PDF
    const text = await extractPDFText(pdfData);
    console.log('Extracted text length:', text ? text.length : 0);
    
    if (!text) {
      throw new Error('No text could be extracted from the PDF');
    }
    
    // Send text to background script for summarization
    console.log('Sending text to background script for summarization...');
    const response = await browser.runtime.sendMessage({
      action: "summarizePDF",
      text: text
    });
    
    console.log('Received response from background script:', response);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Display summary
    displaySummary(response.summary);
    return { success: true };
  } catch (error) {
    console.error('Error processing PDF:', error);
    displayError(error.message || 'Failed to process PDF');
    throw error;
  }
}

async function getPDFAsUint8Array() {
  return new Promise((resolve, reject) => {
    // Get the PDF viewer iframe
    const pdfViewer = document.querySelector('#viewer') || 
                     document.querySelector('.pdfViewer') ||
                     document.querySelector('embed[type="application/pdf"]') ||
                     document.querySelector('object[type="application/pdf"]');
                     
    if (!pdfViewer) {
      reject(new Error('No PDF viewer found'));
      return;
    }

    // Create a FileReader
    const reader = new FileReader();
    
    // Get the PDF file from the viewer
    const pdfFile = pdfViewer.files?.[0] || pdfViewer.contentDocument?.files?.[0];
    if (!pdfFile) {
      reject(new Error('No PDF file found in viewer'));
      return;
    }

    // Read the file as ArrayBuffer
    reader.readAsArrayBuffer(pdfFile);
    
    reader.onload = function(e) {
      try {
        // Convert ArrayBuffer to Uint8Array
        const uint8Array = new Uint8Array(e.target.result);
        resolve(uint8Array);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = function(error) {
      reject(error);
    };
  });
}

async function extractPDFText(pdfData) {
  console.log('Starting text extraction...');
  try {
    // Load PDF.js
    const pdfjsLib = await loadPDFJS();
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    console.log('PDF loaded, pages:', pdf.numPages);
    
    // Extract text from all pages
    let extractedText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Processing page ${i}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      extractedText += pageText + '\n\n';
    }
    
    console.log('Text extraction complete');
    return extractedText.trim();
  } catch (error) {
    console.error('Error extracting text:', error);
    return '';
  }
}

async function loadPDFJS() {
  return new Promise((resolve, reject) => {
    // Check if PDF.js is already loaded
    if (window['pdfjs-dist/build/pdf']) {
      resolve(window['pdfjs-dist/build/pdf']);
      return;
    }

    // Load PDF.js dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      // Initialize PDF.js worker
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function displaySummary(summary) {
  console.log('Displaying summary...');
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
  console.log('Summary displayed');
}

function displayError(message) {
  console.error('Displaying error:', message);
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