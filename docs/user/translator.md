[Русская версия](ru/translator.md)

# Translator

The translator shows a translation of a passage in a card at the bottom-right
corner of the reader. It sends text to a translation service that you choose and
pay for, with your own API key. vibe-reader has no translation service of its own.

## Open the card

- Press `Y`, or click the translator button in the dock.
- Select text and press **Translate** in the selection bar.
- Open the More menu (…) and choose **Translate this page**. The command palette
  has the same command.

## The card

| Part | What it does |
|---|---|
| Source text | The text to translate. Select text in the book, or press **This page**. |
| Target language | The language to translate into. |
| This page | Translates the visible page. |
| Translate (`Ctrl+Enter`) | Translates the source text. |
| Translation | The result. |
| Copy | Copies the translation. |

Text is sent only when you press **Translate** or **This page**. Nothing is sent
while you read.

## Services

The provider is chosen in Settings → Translator. Each one needs your own key:

- **DeepL.** Keys that end in `:fx` use the free API address.
- **Google Cloud Translation** (API v2).
- **OpenRouter.** Any chat model available there. The model is set in Settings,
  and the default is `openai/gpt-4o-mini`. The text is sent as data to translate,
  not as instructions.

Settings → Translator also has a **Check** button. It translates one sentence, so
you can see that the key works.

## Target language

The default target is **Interface language**, which follows the language of the
window. You can pick another language from the list. In `config.toml`, the
`target` key under `[translate]` accepts any language code.

## Limits

A request can hold up to 20,000 characters, and it times out after 40 seconds. If
the service rejects the key, the card says so. If you reach the service's limit,
it says that too.

Keys are stored in `config.toml`. See [configuration](configuration.md#api-keys).
