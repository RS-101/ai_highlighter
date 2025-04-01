# AI Highlighter

A Firefox extension that intelligently summarizes webpages and PDF documents while highlighting key passages for easier reading.

## Features

- **Smart Summarization**: Analyzes webpages and PDF files to provide concise summaries
- **Intelligent Highlighting**: Automatically identifies and highlights important passages
- **PDF Support**: Extracts and summarizes text from PDF files
- **Toggle Highlights**: Easily toggle highlights on and off with a single click
- **Settings Management**: Configure auto-summarization for specific websites

## Installation

### From Firefox Add-ons Store
1. Visit the [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/ai-highlighter/)
2. Click "Add to Firefox"
3. Follow the prompts to complete installation

### Manual Installation (Developer Mode)
1. Download the latest release ZIP file
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the downloaded ZIP file

## Setup

1. After installation, click on the AI Highlighter icon in your toolbar
2. Go to the "Settings" tab
3. Enter your Anwall API key in the API Key field
4. Click "Save API Key"

## Usage

### Summarizing Content
1. Navigate to a webpage or PDF file you want to summarize
2. Click the AI Highlighter extension icon
3. Click "Summarize Page" or "Summarize PDF"
4. View the summary and key highlights

### Managing Highlights
- For webpages: Use the "Toggle Highlights" button to show/hide highlights
- Highlighted text appears with a yellow background on the page
- For PDFs: Important passages are displayed in the extension popup

### Auto-Summarization
1. Go to the "Settings" tab
2. Enable "Enable automatic summarization"
3. Add domains you want auto-summarized (e.g., "example.com")
4. Click "Save Settings"

## API Key

This extension uses the Awan LLM API for summarization. You'll need to:
1. Obtain an API key from [Awan LLM](https://awanllm.com/)
2. Enter it in the extension settings
3. Your API key is stored locally and never shared

## Privacy

- Your data is processed locally where possible
- Content is sent to the AI service only for summarization
- No user data is collected or stored beyond local browser storage

## Limitations

- PDF highlighting is limited to displaying important passages in the popup
- Very long documents may be truncated for processing
- Requires an internet connection for summarization

## License

All Rights Reserved

## Support

For issues or feature requests, please submit them on our [GitHub repository](https://github.com/RS-101/ai_highlighter)
