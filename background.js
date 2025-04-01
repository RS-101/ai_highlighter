console.log("[Background] Script loaded");
console.log("[Background] Browser API available:", !!browser);
console.log("[Background] Downloads API available:", !!(browser && browser.downloads));
console.log("[Background] Runtime API available:", !!(browser && browser.runtime));

// Store the current content information
let currentState = {
  url: null,
  isPDF: false,
  pdfBlob: null,
  tabId: null,
  summary: null,  // Store the latest summary result
  highlights: null, // Store the latest highlights
  timestamp: null  // Track when the summary was generated
};

// Listen for web navigation events
browser.webNavigation.onCompleted.addListener((details) => {
  console.log("[Background] Navigation completed:", details);
  
  // Only consider main frame navigations (not iframes)
  if (details.frameId !== 0) return;
  
  // Store the tab ID
  currentState.tabId = details.tabId;
  currentState.url = details.url;
  currentState.summary = null;
  currentState.highlights = null;
  
  // Check if the URL ends with .pdf
  if (details.url && details.url.toLowerCase().endsWith('.pdf')) {
    console.log("[Background] PDF detected:", details.url);
    currentState.isPDF = true;
    
    // Try to fetch the PDF content
    fetchPDFContent(details.url).catch(error => {
      console.error("[Background] Error fetching PDF content:", error);
    });
  } else {
    console.log("[Background] Regular webpage detected:", details.url);
    currentState.isPDF = false;
    currentState.pdfBlob = null;
  }
});

// Fetch and store PDF content
async function fetchPDFContent(url) {
  try {
    console.log("[Background] Attempting to fetch PDF content:", url);
    const response = await fetch(url);
    const blob = await response.blob();
    console.log("[Background] PDF blob received:", blob.size, "bytes");
    
    // Store the blob for later use
    currentState.pdfBlob = blob;
    currentState.url = url;
    
    return blob;
  } catch (error) {
    console.error("[Background] Error handling PDF:", error);
    throw error;
  }
}

// Listen for messages from content script or popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message);
  
  switch (message.type) {
    case "GET_CURRENT_CONTENT":
      // Get current tab info
      return browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
          if (tabs.length === 0) {
            return { status: "error", message: "No active tab found" };
          }
          
          const tab = tabs[0];
          const isPDF = tab.url.toLowerCase().endsWith('.pdf') || 
                       tab.url.startsWith('file://') && tab.url.toLowerCase().endsWith('.pdf');
          
          // Include any cached summary data
          return {
            status: "success",
            url: tab.url,
            isPDF: isPDF,
            tabId: tab.id,
            hasCachedSummary: !!(currentState.summary && currentState.url === tab.url),
            summary: currentState.summary,
            highlights: currentState.highlights,
            timestamp: currentState.timestamp
          };
        });
        
    case "EXTRACT_WEBPAGE_CONTENT":
      // Extract content from webpage
      return browser.tabs.query({ active: true, currentWindow: true })
        .then(tabs => {
          if (tabs.length === 0) {
            return { status: "error", message: "No active tab found" };
          }
          
          const tab = tabs[0];
          if (tab.url.toLowerCase().endsWith('.pdf')) {
            return { status: "error", message: "Cannot extract content from PDF" };
          }
          
          return browser.tabs.sendMessage(tab.id, { type: "EXTRACT_WEBPAGE_CONTENT" });
        });
    
    case "RESIZE_POPUP":
      // Resize the popup window
      if (browser.browserAction && browser.browserAction.setPopup) {
        console.log("[Background] Resizing popup to:", message.width, "x", message.height);
        
        try {
          // For Firefox, we need to recreate the popup with parameters for sizing
          const popup = new URL(browser.runtime.getURL("popup.html"));
          popup.searchParams.set("width", message.width);
          popup.searchParams.set("height", message.height);
          
          browser.browserAction.setPopup({ popup: popup.toString() });
          return Promise.resolve({ status: "success" });
        } catch (error) {
          console.error("[Background] Error resizing popup:", error);
          return Promise.resolve({ status: "error", message: error.message });
        }
      } else {
        console.log("[Background] browserAction.setPopup not available");
        return Promise.resolve({ status: "error", message: "browserAction.setPopup not available" });
      }
        
    case "AUTO_PROCESS_CONTENT":
      // Automatically process content when page loads
      console.log("[Background] Auto-processing webpage content");
      return summarizeText(message.content)
        .then(result => {
          // Store the summary in currentState
          if (result) {
            currentState.summary = result.summary;
            currentState.highlights = result.highlights;
            currentState.timestamp = Date.now();
            
            // Associate with the current URL
            if (sender && sender.tab) {
              currentState.url = sender.tab.url;
              currentState.tabId = sender.tab.id;
            }
            
            console.log("[Background] Cached summary for URL:", currentState.url);
          }
          
          return {
            status: "success",
            summary: result
          };
        })
        .catch(error => {
          console.error("[Background] Auto-processing error:", error);
          return {
            status: "error",
            message: error.message
          };
        });
        
    case "SUMMARIZE_CONTENT":
      // Check if we have a cached summary for this content
      if (currentState.url === message.url && currentState.summary) {
        console.log("[Background] Returning cached summary for:", message.url);
        return Promise.resolve({
          status: "success",
          summary: {
            summary: currentState.summary,
            highlights: currentState.highlights
          },
          fromCache: true
        });
      }
      
      // Summarize the provided text
      return summarizeText(message.text)
        .then(result => {
          // Store the summary in currentState
          if (result) {
            currentState.summary = result.summary;
            currentState.highlights = result.highlights;
            currentState.timestamp = Date.now();
            
            // Associate with the URL if provided
            if (message.url) {
              currentState.url = message.url;
            }
            
            console.log("[Background] Cached new summary for URL:", currentState.url);
          }
          
          return {
            status: "success",
            summary: result
          };
        })
        .catch(error => {
          console.error("[Background] Summarization error:", error);
          return {
            status: "error",
            message: error.message
          };
        });
        
    case "PDF_CONTENT":
      // Handle PDF content from content script
      console.log("[Background] Received PDF content");
      return sendResponse({ status: "success" });
      
    default:
      return Promise.resolve({ status: "error", message: "Unknown message type" });
  }
  
  return true; // Keep the message channel open for async responses
});

async function summarizeText(text) {
  const AWANLLM_API_KEY = 'd75d2637-5931-4cac-910b-8ad89b33e4a3';
  
  try {
    console.log("[Background] Sending request to AwanLLM API...");
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
            "content": "You are a helpful assistant that specializes in analyzing text. You'll provide: 1) A concise summary of the text, and 2) A list of important text segments to highlight. The highlights must be exact verbatim quotes from the original text."
          },
          {
            "role": "user", 
            "content": `Analyze the following text and provide two sections:
1. SUMMARY: A concise summary that captures the main points.
2. HIGHLIGHTS: A JSON array of exactly 5-7 important text segments to highlight. Each segment should be a direct quote from the original text (not paraphrased) and should be between 5-30 words.

Format your response exactly like this:
SUMMARY: [your summary here]

HIGHLIGHTS: 
[
  "exact quote 1",
  "exact quote 2",
  "exact quote 3",
  ...
]

Here's the text to analyze:

${text}`
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

    console.log("[Background] API Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Background] API Error response:", errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("[Background] API Response data:", data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      
      // Extract summary and highlights from the response
      const summaryMatch = content.match(/SUMMARY:\s*(.*?)(?=\n\n)/s);
      const highlightsMatch = content.match(/HIGHLIGHTS:\s*\[([\s\S]*?)\]/);
      
      const summary = summaryMatch ? summaryMatch[1].trim() : "No summary available";
      
      let highlights = [];
      if (highlightsMatch && highlightsMatch[1]) {
        try {
          // Try to parse the highlights as JSON
          highlights = JSON.parse(`[${highlightsMatch[1]}]`);
        } catch (e) {
          // If JSON parsing fails, try to extract quotes using regex
          const quoteMatches = highlightsMatch[1].match(/"([^"]*)"/g);
          if (quoteMatches) {
            highlights = quoteMatches.map(quote => quote.replace(/^"|"$/g, ''));
          }
        }
      }
      
      console.log("[Background] Extracted summary:", summary);
      console.log("[Background] Extracted highlights:", highlights);
      
      return {
        summary,
        highlights
      };
    } else {
      console.error("[Background] Unexpected API response format:", data);
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error("[Background] Error in summarization:", error);
    throw error;
  }
} 