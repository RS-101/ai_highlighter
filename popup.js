document.addEventListener('DOMContentLoaded', () => {
  const summarizeButton = document.getElementById('summarize');
  const statusDiv = document.getElementById('status');

  summarizeButton.addEventListener('click', async () => {
    try {
      // Get the current active tab
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];

      // Check if the current tab is a PDF
      if (!currentTab.url.toLowerCase().endsWith('.pdf')) {
        showStatus('Please open a PDF file first', 'error');
        return;
      }

      // Send message to content script to process the PDF
      const response = await browser.tabs.sendMessage(currentTab.id, { action: "processPDF" });
      
      if (response && response.error) {
        throw new Error(response.error);
      }

      showStatus('PDF processing started', 'success');
    } catch (error) {
      console.error('Error:', error);
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