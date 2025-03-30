# PDF Auto Summarizer Firefox Extension

This Firefox extension automatically summarizes PDF files as you view them in your browser.

## Features

- Automatically detects when you're viewing a PDF file
- Extracts text from the PDF
- Generates a summary using AI/ML technology
- Displays the summary in a clean, non-intrusive overlay
- Manual summarization option through the extension popup

## Installation

1. Clone or download this repository
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" on the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension directory and select the `manifest.json` file

## Usage

1. The extension will automatically detect when you're viewing a PDF file
2. It will process the PDF and display a summary in the top-right corner
3. You can also click the extension icon and use the "Summarize Current PDF" button to manually trigger summarization
4. To dismiss the summary, click the × button in the top-right corner of the summary overlay

## Development

To modify or enhance the extension:

1. Make your changes to the source files
2. Reload the extension in `about:debugging`
3. Test your changes

## Requirements

- Firefox browser
- An API key for the text summarization service (you'll need to add your own API key in the `background.js` file)

## Note

This extension requires integration with a text summarization service. You'll need to:

1. Choose a text summarization service (e.g., OpenAI's API)
2. Add your API key in the `background.js` file
3. Update the API endpoint in the `summarizeText` function

## License

MIT License
