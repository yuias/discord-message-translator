# Discord Message Translator

Chrome Extension to automatically translate Discord messages with Google Translate, DeepL, or OpenAI-compatible APIs.

## Features

- **Auto Translation**: Automatically translate Discord messages as they appear
- **Multiple Translation Providers**: Support for Chrome Built-in Translator, Google Translate, DeepL, and OpenAI-compatible APIs (GPT-4, Claude, Gemini, etc.)
- **Chrome Built-in Translator**: Free translation using Chrome's native API (no API key required)
- **Language Detection**: Skip translation for messages already in target language (using Chrome's Language Detector API)
- **Smart Caching**: Message ID-based caching with automatic cleanup to reduce API costs
- **Intersection Observer**: Only translates visible messages for optimal performance
- **Translation Modes**: Replace original text or show both original and translation
- **Cache Visualization**: Monitor cache usage and storage statistics
- **Modern UI**: Built with DaisyUI and Tailwind CSS

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Extension

```bash
npm run build
```

This will create a `dist` folder with the compiled extension.

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `dist` folder

### 4. Configure Translation Provider

1. Click the extension icon in Chrome
2. Open the **API** tab
3. Select your preferred translation provider:
   - **Google Translate**: Get an API key from [Google Cloud Translation API](https://cloud.google.com/translate/docs)
   - **DeepL**: Get an API key from [DeepL API](https://www.deepl.com/pro-api)
   - **OpenAI-compatible API**: Configure with any OpenAI-compatible endpoint
     - OpenAI (GPT-4, GPT-3.5)
     - Anthropic Claude (via compatible endpoints)
     - Google Gemini (via compatible endpoints)
     - Other OpenAI-compatible services
4. Enter your API key and configure provider-specific settings (auto-saved)

For OpenAI-compatible APIs, you'll need to configure:
- **Base URL**: API endpoint (e.g., `https://api.openai.com/v1`)
- **Model**: Model name (e.g., `gpt-4`, `claude-3-5-sonnet-20241022`)
- **API Key**: Your API key for the service

## Development

### Environment Setup

For development, you can create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Then configure your API keys:

```env
VITE_GOOGLE_TRANSLATE_API_KEY=your_google_api_key
VITE_DEEPL_API_KEY=your_deepl_api_key
VITE_OPENAI_API_KEY=your_openai_api_key
```

**Note**: In production (Chrome Extension), API keys are stored securely in Chrome Storage API, not in environment variables.

### Run in Development Mode

```bash
npm run dev
```

This will start Vite in development mode with hot reloading.

### Type Checking

```bash
npm run type-check
```

## Project Structure

```
discord-message-translator/
├── entrypoints/
│   ├── background/          # Service Worker
│   ├── content/             # Content Script (injected into Discord)
│   └── popup/               # Popup UI (includes all settings)
├── lib/
│   ├── api/                 # Translation API clients
│   ├── cache/               # Cache implementation
│   └── utils/               # Utility functions
├── types/                   # TypeScript type definitions
├── public/
│   ├── _locales/            # i18n messages (en, ja)
│   └── icons/               # Extension icons
└── .output/                 # Build output (load this in Chrome)
```

## Usage

### Quick Start

1. Open Discord in Chrome
2. Click the extension icon
3. Toggle "Auto Translate" on
4. Select your target language
5. Messages will be automatically translated as you scroll

### Settings

- **Translation Provider**: Choose between Google Translate, DeepL, OpenAI-compatible APIs, or Chrome Built-in Translator
- **API Configuration**: Configure API keys and provider-specific settings
- **Target Language**: Choose which language to translate to
- **Auto Translate**: Enable/disable automatic translation of messages
- **Translation Mode**:
  - **Replace Original**: Replace the original message with translation
  - **Show Both**: Display both original and translated text
- **Skip Target Language**: Automatically skip translation for messages already in the target language (requires Chrome's Language Detector API)
- **Cache Settings**:
  - **Cache TTL**: How long to keep translations cached (default: 7 days)
  - **Cache Usage**: View current cache usage and storage statistics
  - **Clear Cache**: Manually clear all cached translations

## Technical Details

### Cache Management

- Uses Chrome Storage API (10MB limit)
- Automatic LRU (Least Recently Used) cleanup when reaching 80% capacity
- Reduces to 60% capacity by deleting oldest messages
- Ensures new messages can always be cached

### Performance Optimizations

- **Intersection Observer**: Only translates messages visible in viewport
- **Smart Caching**: Avoids duplicate API calls for the same message
- **100px Root Margin**: Pre-loads translations before scrolling to prevent flickering
- **Language Detection**: Skips translation for messages already in target language

### Translation Providers

#### Chrome Built-in Translator
- Free translation using Chrome's built-in Translator API
- No API key required
- Available in Chrome 138+ with experimental flags enabled
- Limited language pair support compared to cloud services

#### Google Translate
- Fast and reliable translation service
- Supports 100+ languages
- Cost-effective for high-volume translation

#### DeepL
- High-quality neural machine translation
- Excellent for European languages
- More accurate translations than traditional services

#### OpenAI-compatible APIs
- LLM-powered translation with context awareness
- Automatic source language detection
- Supports multiple models:
  - OpenAI GPT-4, GPT-3.5
  - Anthropic Claude (via compatible endpoints)
  - Google Gemini (via compatible endpoints)
- Best for nuanced or contextual translations

### Future Enhancements

- IndexedDB migration for unlimited cache storage
- Enhanced error handling and retry logic
- Custom translation prompts for LLM providers
- Translation quality feedback system

## License

MIT
