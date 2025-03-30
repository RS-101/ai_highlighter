// Listen for navigation events
browser.webNavigation.onCompleted.addListener(async (details) => {
  console.log('Navigation completed:', details);
  
  // Check if the URL is a PDF
  if (details.url.toLowerCase().endsWith('.pdf') || details.url.startsWith('file://')) {
    console.log('PDF detected, attempting to inject content script');
    try {
      // For local files, we need to handle them differently
      if (details.url.startsWith('file://')) {
        // First try to inject the content script
        await browser.tabs.executeScript(details.tabId, {
          file: 'content.js',
          runAt: 'document_start'
        });
        
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // For remote PDFs, use the normal injection method
        await browser.tabs.executeScript(details.tabId, {
          file: 'content.js'
        });
      }
      
      // Send message to process PDF
      await browser.tabs.sendMessage(details.tabId, {
        action: "processPDF"
      });
      
      console.log('Content script injected and message sent');
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
  }
});

// Listen for messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  
  if (message.action === "summarizePDF") {
    console.log('Starting PDF summarization...');
    // Call the summarization API
    summarizeText(message.text)
      .then(summary => {
        console.log('Summarization successful');
        sendResponse({ summary });
      })
      .catch(error => {
        console.error('Error summarizing PDF:', error);
        sendResponse({ error: error.message || 'Failed to summarize PDF' });
      });
    return true; // Will respond asynchronously
  }
});

async function summarizeText(text) {
  const AWANLLM_API_KEY = 'd75d2637-5931-4cac-910b-8ad89b33e4a3';
  
  try {
    console.log('Sending request to AwanLLM API...');
    const response = await fetch("https://api.awanllm.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AWANLLM_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "Meta-Llama-3-8B-Instruct",
        "messages": [
          {
            "role": "system", 
            "content": "You are a helpful assistant that specializes in summarizing text. Provide concise, clear summaries that capture the main points and key information."
          },
          {
            "role": "user", 
            "content": `Please provide a concise summary of the following text:\n\n${text}`
          }
        ],
        "repetition_penalty": 1.1,
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "max_tokens": 1024,
        "stream": false
      })
    });

    console.log('API Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error response:', errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('API Response data:', data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      console.error('Unexpected API response format:', data);
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error('Error in summarization:', error);
    throw error;
  }
} 