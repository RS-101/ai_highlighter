console.log("[Background] Script loaded");
console.log("[Background] Browser API available:", !!browser);
console.log("[Background] Downloads API available:", !!(browser && browser.downloads));
console.log("[Background] Runtime API available:", !!(browser && browser.runtime));

// Store the current content information
let currentState = {
  url: null,
  isPDF: false,
  pdfBlob: null,
  tabId: null
};

// Listen for web navigation events
browser.webNavigation.onCompleted.addListener((details) => {
  console.log("[Background] Navigation completed:", details);
  
  // Only consider main frame navigations (not iframes)
  if (details.frameId !== 0) return;
  
  // Store the tab ID
  currentState.tabId = details.tabId;
  currentState.url = details.url;
  
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
          
          return {
            status: "success",
            url: tab.url,
            isPDF: isPDF,
            tabId: tab.id
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
    
    case "AUTO_PROCESS_CONTENT":
      // Automatically process content when page loads
      console.log("[Background] Auto-processing webpage content");
      return summarizeText(message.content)
        .then(result => {
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
      // Summarize the provided text
      return summarizeText(message.text)
        .then(result => {
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