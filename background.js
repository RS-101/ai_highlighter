// Listen for tab updates
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the page has finished loading and is a PDF
  if (changeInfo.status === 'complete' && tab.url && tab.url.toLowerCase().endsWith('.pdf')) {
    // Send message to content script to process the PDF
    browser.tabs.sendMessage(tabId, { action: "processPDF" });
  }
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "summarizePDF") {
    // Here you would integrate with your preferred AI/ML service for summarization
    // For example, OpenAI's API or other text summarization services
    summarizeText(message.text)
      .then(summary => {
        sendResponse({ summary });
      })
      .catch(error => {
        console.error('Error summarizing PDF:', error);
        sendResponse({ error: 'Failed to summarize PDF' });
      });
    return true; // Will respond asynchronously
  }
});

async function summarizeText(text) {
  // This is a placeholder for the actual summarization logic
  // You would need to integrate with an AI service here
  // For example, using OpenAI's API or other text summarization services
  try {
    // Example using a hypothetical API
    const response = await fetch('YOUR_SUMMARIZATION_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add your API key here
        'Authorization': 'Bearer YOUR_API_KEY'
      },
      body: JSON.stringify({ text })
    });
    
    const data = await response.json();
    return data.summary;
  } catch (error) {
    console.error('Error in summarization:', error);
    throw error;
  }
} 