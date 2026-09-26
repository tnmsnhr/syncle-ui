# Syncle Chrome Extension

Syncle lets you lasso areas on any webpage and open chat-style bubbles beside your selection.

**How it works (short):** A full-viewport overlay sits on top of each tab (`pointer-events: none` until you hold ⌘/Ctrl). You draw anywhere on the visible page; a chat bubble opens beside the selection. Configure lasso colors and panel theme in the extension popup. See [Architecture explorer](#architecture-explorer) (`docs/extension-flow.html`) for diagrams and step-by-step flows.

## Features

- **Free-hand Drawing**: Hold Ctrl key and draw circles or any shape on web pages
- **Multiple Colors**: Choose from 8 different colors for your drawings
- **AI Analysis**: Get instant analysis of text, images, code, or mixed content
- **Real-time Popup**: View analysis results in a popup next to your selection
- **Easy Controls**: Simple popup interface with enable/disable and clear options

## How to Use

1. **Install the Extension**:
   - Build the extension using `npm run build`
   - Load the `dist` folder as an unpacked extension in Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

2. **Using the Extension**:
   - Navigate to any webpage
   - Hold the **⌘** (Command) key
   - Click and drag to draw a circle or free-hand shape
   - Release to analyze the selected area
   - View AI analysis in the popup that appears

3. **Controls**:
   - **⌘ + Mouse**: Draw selection areas
   - **Extension Popup**: Change colors, clear areas, enable/disable
   - **Color Picker**: Choose from 8 different colors
   - **Clear All**: Remove all drawn areas

## Architecture explorer

Interactive documentation in **`docs/extension-flow.html`** — Chrome Extension 101 (background vs content script, manifest, every file) plus Syncle flows:

| Section | What it covers |
|--------|----------------|
| **§2 Draw on whole page** | Fixed overlay, viewport-sized canvases, ⌘/Ctrl + window pointer listeners |
| **§4+** | Lasso commit → screenshot crop → register → AI chat |

```bash
cd syncle-ui && open docs/extension-flow.html
```

Or open `syncle-ui/docs/extension-flow.html` in any browser (Mermaid loads from CDN).

## Development

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Production build (load dist/ in Chrome once per release)
npm run build

# Development: auto-rebuild the unpacked extension
npm run dev:ext

# Component workbench: hot reload for bubbles, nudge, and toolbars
npm run dev:ui
```

### Faster development (watch mode)

Chrome extensions cannot hot-reload like a normal Vite web app, but you can avoid running `npm run build` by hand:

1. **Once:** load the unpacked extension from `dist/` on `chrome://extensions`.
2. **Leave running:** `npm run dev:ext` — rebuilds `dist/` whenever you save `src/`, `popup.html`, or `public/`.
3. **After a rebuild** (terminal shows Vite finished):
   - Click **Reload** on the extension card on `chrome://extensions`, **or** use the [Extensions Reloader](https://chromewebstore.google.com/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid) extension for a one-key shortcut.
   - **Refresh the tab** you are testing on so the updated content script runs.

| Change type | Reload extension? | Refresh page? |
|-------------|-------------------|---------------|
| Popup UI (`src/popup/`) | Yes | Reopen popup |
| Content script / overlay | Yes | Yes |
| `public/background.js` | Yes | Usually no |

`npm run dev` only runs the Vite dev server for the popup HTML in isolation; it does **not** update the loaded extension. Use `npm run dev:ext` for extension work.

### Project Structure
```
syncle-extension/
├── src/
│   ├── components/
│   │   ├── CircleOverlay.jsx    # Drawing canvas overlay
│   │   ├── InfoPopup.jsx        # AI analysis popup
│   │   └── Popup.jsx            # Extension popup interface
│   ├── context/
│   │   └── HighlightContext.jsx # State management
│   ├── App.jsx                  # Main app component
│   ├── background.js            # Background service worker
│   ├── contentScript.jsx        # Content script for webpage interaction
│   └── index.jsx                # Entry point
├── public/
│   ├── manifest.json            # Extension manifest
│   └── icon.png                 # Extension icon
├── dist/                        # Built extension files
└── package.json
```

### Key Components

- **CircleOverlay**: Handles the drawing canvas and visual feedback
- **InfoPopup**: Displays AI analysis results and color controls
- **HighlightContext**: Manages drawing state, keyboard events, and AI communication
- **Background Script**: Handles AI processing and message routing

## AI Integration

The extension currently uses a simulated AI response. To integrate with real AI services:

1. Update the `handleAIExtraction` function in `src/background.js`
2. Replace the `simulateAIResponse` function with actual API calls
3. Add your API keys and endpoints

Supported AI services you can integrate:
- OpenAI GPT
- Google Gemini
- Anthropic Claude
- Azure Cognitive Services
- Custom AI APIs

## Customization

### Colors
Edit the `colors` array in `src/components/InfoPopup.jsx` to add or change available colors.

### Keyboard Shortcut
Change the Command (⌘) key to another key by modifying the keyboard event handlers in `src/context/HighlightContext.jsx`.

### Popup Position
Adjust popup positioning logic in `src/context/HighlightContext.jsx` in the `extractContentFromArea` function.

## Browser Compatibility

- Chrome 88+
- Edge 88+
- Other Chromium-based browsers

## License

MIT License - feel free to use and modify as needed.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and feature requests, please create an issue in the repository.
