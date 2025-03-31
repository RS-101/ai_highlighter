document.addEventListener('DOMContentLoaded', () => {
  const summarizeButton = document.getElementById('summarize');
  const statusDiv = document.getElementById('status');

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
      const pdfBlob = await pdfResponse.blob();
      console.log("[Popup] PDF blob received:", pdfBlob.size, "bytes");
      
      // Extract text from PDF
      const pdfText = await extractTextFromPdf(pdfBlob);
      console.log("[Popup] Extracted text length:", pdfText.length);
      
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
      
    } catch (error) {
      console.error('[Popup] Error:', error);
      showStatus('Failed to process PDF: ' + error.message, 'error');
    }
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // Hide the status message after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
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

// Function to extract text from a PDF blob
async function extractTextFromPdf(pdfBlob) {
  // In a real implementation, you would use PDF.js or similar library
  // For now, just return a sample text
  return "This is a placeholder for extracted PDF text. In a real implementation, " +
         "you would use PDF.js or a similar library to extract the actual text " +
         "from the PDF document. The PDF blob size is " + pdfBlob.size + " bytes.";
} 