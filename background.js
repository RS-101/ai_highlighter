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

// Extension settings with defaults
let settings = {
  autoSummarizeEnabled: false,
  autoSummarizeSites: []  // List of domains to auto-summarize
};

// Load settings when extension starts
loadSettings();

// Function to load settings from storage
function loadSettings() {
  browser.storage.local.get('settings').then(result => {
    if (result.settings) {
      settings = result.settings;
      console.log("[Background] Loaded settings:", settings);
    } else {
      // Initialize with default settings if none exist
      saveSettings();
    }
  }).catch(error => {
    console.error("[Background] Error loading settings:", error);
  });
}

// Save settings to storage
function saveSettings() {
  browser.storage.local.set({ settings }).then(() => {
    console.log("[Background] Settings saved:", settings);
  }).catch(error => {
    console.error("[Background] Error saving settings:", error);
  });
}

// Check if the given URL's domain matches any in the auto-summarize list
function shouldAutoSummarize(url) {
  if (!settings.autoSummarizeEnabled) return false;
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    return settings.autoSummarizeSites.some(site => {
      // Check if domain matches exactly or is a subdomain
      return domain === site || domain.endsWith('.' + site);
    });
  } catch (e) {
    console.error("[Background] Error parsing URL:", e);
    return false;
  }
}

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
    
    // Check if this site should be auto-summarized
    if (shouldAutoSummarize(details.url)) {
      console.log("[Background] Auto-summarize enabled for this site:", details.url);
      // We'll let the content script know this site should be auto-summarized
    }
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
          
          // Check if auto-summarize is enabled for this site
          const shouldAuto = shouldAutoSummarize(tab.url);
          
          // Include any cached summary data
          return {
            status: "success",
            url: tab.url,
            isPDF: isPDF,
            tabId: tab.id,
            hasCachedSummary: !!(currentState.summary && currentState.url === tab.url),
            summary: currentState.summary,
            highlights: currentState.highlights,
            timestamp: currentState.timestamp,
            shouldAutoSummarize: shouldAuto
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
    
    case "CHECK_AUTO_SUMMARIZE":
      // Check if current URL should be auto-summarized
      return Promise.resolve({
        status: "success",
        shouldAutoSummarize: shouldAutoSummarize(message.url)
      });
        
    case "AUTO_PROCESS_CONTENT":
      // Check if this site should be auto-summarized
      if (!shouldAutoSummarize(message.url)) {
        console.log("[Background] Auto-summarize disabled for this site:", message.url);
        return Promise.resolve({
          status: "skip",
          message: "Auto-summarize not enabled for this site"
        });
      }
      
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
        
    case "GET_SETTINGS":
      // Return current settings
      return Promise.resolve({
        status: "success", 
        settings: settings
      });
      
    case "SAVE_SETTINGS":
      // Update settings
      settings = message.settings;
      saveSettings();
      return Promise.resolve({ status: "success" });
        
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
    // Ensure text is limited to 2300 characters
    const limitedText = limitContentSize(text, 2300);
    console.log(`[Background] Text length for API: ${limitedText.length} characters`);
    
    console.log("[Background] Sending request to AwanLLM API...");
    const response = await fetch("https://api.awanllm.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AWANLLM_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "Meta-Llama-3.1-8B-Instruct",
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

${limitedText}`
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

// Function to limit content size while preserving complete sentences
function limitContentSize(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  
  // Find a good cutoff point (end of sentence) near the maxLength
  let cutoff = maxLength;
  
  // Look for sentence endings (.!?) near the maxLength
  const sentenceEndRegex = /[.!?]\s+/g;
  let match;
  let lastGoodCutoff = 0;
  
  while ((match = sentenceEndRegex.exec(text)) !== null) {
    if (match.index > maxLength) break;
    lastGoodCutoff = match.index + match[0].length - 1;
  }
  
  // If we found a good sentence ending, use that, otherwise just cut at maxLength
  cutoff = lastGoodCutoff > 0 ? lastGoodCutoff + 1 : maxLength;
  
  const limitedContent = text.substring(0, cutoff);
  console.log(`[Background] Limited content from ${text.length} to ${limitedContent.length} characters`);
  
  return limitedContent;
} 