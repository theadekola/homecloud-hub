# Connection guidance, pairing actions and AI providers

The Proxmox user/token instructions now use a closed-by-default native details disclosure, with a coloured summary and a rotating expand/collapse chevron. Dark and light theme title colours are defined.

Discovered Docker guests and Proxmox nodes show the automatic SSH action without the redundant pairing-code generation button. The manual installer remains available for standalone Docker hosts outside the discovered Proxmox inventory, where automatic SSH setup is not supported. Existing host-key verification, explicit installation consent and password clearing remain intact.

AI setup supports OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Groq and Mistral. Provider selection updates API type and suggested model choices; model discovery uses the selected provider's key and fixed endpoint. Native Messages and Generate Content request/response adapters supplement the existing OpenAI-compatible chat support. Old OpenAI settings remain compatible. Switching provider cannot reuse a saved key from a different provider. Errors do not reflect upstream bodies or credentials. The connection list reports the configured provider, and privacy/setup documentation now covers all supported providers.

The HTTPS browser audit revealed that configuration refresh events could overwrite a dirty form during model discovery. Dirty drafts now survive those background refreshes; own saves and disconnects still refresh their saved state. Added regression coverage includes preserving the selected provider and key across a configuration refresh.

Validation: 608 web tests, 557 API tests, focused provider adapter/configuration tests and production build passed. HTTPS fixture browser checks at desktop and mobile sizes verified disclosure toggling, automatic pairing without a manual code, all six providers' model discovery and connection tests, configuration saving, and reloading the saved provider/model. Proxmox's single-save flow also passed. Provider requests used fixture keys and mocked responses; no live paid API calls or connector installations were performed.
