document.addEventListener('DOMContentLoaded', () => {
  const summarizeButton = document.getElementById('summarize');
  const statusDiv = document.getElementById('status');

  // Set up PDF.js worker
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

  // Disable the button initially
  summarizeButton.disabled = true;

  // Check if a PDF is currently open
  browser.runtime.sendMessage({ type: "GET_PDF_CONTENT" })
    .then(response => {
      console.log("[Popup] Response from background:", response);
      
      if (response && response.status === "success") {
        // Enable the button if we have PDF content
        summarizeButton.disabled = false;
      } else {
        showStatus('No PDF detected. Please open a PDF file first.', 'error');
      }
    })
    .catch(error => {
      console.error('[Popup] Error checking PDF content:', error);
      showStatus('Error connecting to extension: ' + error.message, 'error');
    });

  summarizeButton.addEventListener('click', async () => {
    try {
      summarizeButton.disabled = true;
      summarizeButton.innerHTML = '<span class="loading"></span> Processing...';
      showStatus('Processing PDF...', 'success');
      
      // Request PDF content from background
      const response = await browser.runtime.sendMessage({ 
        type: "GET_PDF_CONTENT"
      });
      
      console.log("[Popup] PDF content response:", response);
      
      if (!response || response.status !== "success") {
        throw new Error(response?.message || "Failed to get PDF content");
      }
      
      // Fetch the PDF directly and process it
      const pdfResponse = await fetch(response.url);
      const pdfArrayBuffer = await pdfResponse.arrayBuffer();
      console.log("[Popup] PDF data received:", pdfArrayBuffer.byteLength, "bytes");
      
      // Extract text from PDF
      const pdfText = await extractTextFromPdf(pdfArrayBuffer);
      console.log("[Popup] Extracted text length:", pdfText.length);
      console.log("[Popup] Extracted text preview:", pdfText.substring(0, 500));
      
      // Send the extracted text for summarization
      const summaryResponse = await browser.runtime.sendMessage({
        type: "SUMMARIZE_PDF",
        text: pdfText
      });
      
      if (!summaryResponse || summaryResponse.status !== "success") {
        throw new Error(summaryResponse?.message || "Failed to summarize PDF");
      }
      
      // Display the summary
      showStatus('Summary completed!', 'success');
      displaySummary(summaryResponse.summary);
      
      // Re-enable the button
      summarizeButton.disabled = false;
      summarizeButton.innerHTML = 'Summarize Current PDF';
      
    } catch (error) {
      console.error('[Popup] Error:', error);
      showStatus('Failed to process PDF: ' + error.message, 'error');
      summarizeButton.disabled = false;
      summarizeButton.innerHTML = 'Summarize Current PDF';
    }
  });
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
    <h3>PDF Summary</h3>
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