console.log("[Background] Script loaded");
console.log("[Background] Browser API available:", !!browser);
console.log("[Background] Downloads API available:", !!(browser && browser.downloads));
console.log("[Background] Runtime API available:", !!(browser && browser.runtime));

// Store the current PDF URL and content
let currentPDFUrl = null;
let currentPDFBlob = null;

// Listen for web navigation events
browser.webNavigation.onCompleted.addListener((details) => {
  console.log("[Background] Navigation completed:", details);
  
  // Check if the URL ends with .pdf
  if (details.url && details.url.toLowerCase().endsWith('.pdf')) {
    console.log("[Background] PDF detected:", details.url);
    currentPDFUrl = details.url;
    
    // Try to fetch the PDF content
    fetchPDFContent(details.url).catch(error => {
      console.error("[Background] Error fetching PDF content:", error);
    });
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
    currentPDFBlob = blob;
    currentPDFUrl = url;
    
    return blob;
  } catch (error) {
    console.error("[Background] Error handling PDF:", error);
    throw error;
  }
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] Received message:", message);
  
  if (message.type === "GET_PDF_CONTENT") {
    if (currentPDFUrl) {
      console.log("[Background] Returning PDF URL:", currentPDFUrl);
      sendResponse({ 
        status: "success", 
        url: currentPDFUrl,
        hasBlob: !!currentPDFBlob
      });
    } else {
      console.log("[Background] No PDF URL available");
      sendResponse({ status: "error", message: "No PDF URL available" });
    }
    return;
  }
  
  if (message.type === "SUMMARIZE_PDF") {
    console.log("[Background] Starting PDF summarization...");
    const textToSummarize = message.text || "No text provided";
    console.log("[Background] Text length:", textToSummarize.length);
    
    summarizeText(textToSummarize)
      .then(summary => {
        console.log("[Background] Summarization successful");
        sendResponse({ 
          status: "success", 
          summary: summary 
        });
      })
      .catch(error => {
        console.error("[Background] Error summarizing PDF:", error);
        sendResponse({ 
          status: "error", 
          message: error.message 
        });
      });
    return true; // Will respond asynchronously
  }
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

    console.log("[Background] API Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Background] API Error response:", errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("[Background] API Response data:", data);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      console.error("[Background] Unexpected API response format:", data);
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error("[Background] Error in summarization:", error);
    throw error;
  }
} 