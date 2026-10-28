# AI providers and models

Open **Settings → Connections → Add Connection → AI Assistant**. Select a provider to update the API format and suggested model choices, then enter an API key issued by that provider.

| Provider | API format |
| --- | --- |
| OpenAI | Responses or Chat Completions |
| Anthropic Claude | Messages |
| Google Gemini | Generate Content |
| DeepSeek | Chat Completions |
| Groq | Chat Completions |
| Mistral AI | Chat Completions |

Use **Load Models** to list text models available to your key. Suggested model IDs are starting points; availability changes and may depend on your account. Choose a listed model or enter a custom ID, then use **Test Connection** to verify that model and API format. Tests send a small prompt and can incur provider charges. Save Configuration applies the selection without restarting i-Clusters.

Switching provider clears the entered key and model list. A new key is required when switching; blank password fields retain a saved key only for the same provider. Existing OpenAI configurations continue to work without re-entering their key. Credentials remain encrypted and are never returned to the browser.

Assistant requests send your question and selected infrastructure measurements to the selected provider. The assistant remains read-only and has no infrastructure tool execution. Requests use fixed provider HTTPS endpoints and do not accept a custom destination URL. See [privacy](../PRIVACY.md) for processing details.

For environment-based setup, use `AI_PROVIDER` (`openai`, `anthropic`, `gemini`, `deepseek`, `groq` or `mistral`). Existing `OPENAI_API_KEY` and `OPENAI_MODEL` variable names also configure the selected provider for compatibility. Leave the model blank to use its default. UI settings override environment defaults after saving.

API references checked during implementation:

- [Claude Messages and Models](https://platform.claude.com/docs/en/api/overview)
- [Gemini Generate Content](https://ai.google.dev/api/generate-content) and [models](https://ai.google.dev/api/models)
- [DeepSeek](https://api-docs.deepseek.com/)
- [Groq compatibility](https://console.groq.com/docs/openai)
- [Mistral Chat](https://docs.mistral.ai/api) and [models](https://docs.mistral.ai/api/endpoint/models)
