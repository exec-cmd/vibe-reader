# vibe-reader

vibe-reader представляет собой десктопную читалку для Linux. Она показывает
EPUB, FB2, Markdown, TXT, HTML и PDF с аккуратной типографикой, а у каждой книги
может быть своя атмосфера: палитра, пара шрифтов, фон, тихий дождь или снег,
рисунки в начале глав и иллюстрации.

Встроенного ИИ в приложении нет. Консольная утилита `vibe-reader` и
поставляемые Skills дают агенту, которым вы уже пользуетесь (Claude Code, Codex,
opencode и другие), читать библиотеку, обсуждать текущую главу без спойлеров,
вести заметки и настраивать атмосферу. Окно читалки сразу показывает, что делает
агент.

[English version](README.md)

## Быстрый старт

Нужны Rust 1.90 или новее и, для окна, WebKitGTK 4.1
(см. [сборку](docs/dev/building.md)).

```bash
git clone https://github.com/exec-cmd/vibe-reader
cd vibe-reader
cargo install --path src/cli
cargo install --path src/gui

vibe-reader add ~/Books/crime-and-punishment.epub --shelf Классика
vibe-reader open
```

Остальные книги перетащите в окно или откройте кнопкой «Открыть…». Архивы и
AppImage прикладываются к каждому [релизу на GitHub](https://github.com/exec-cmd/vibe-reader/releases).

## Чтение

- **Полка, библиотека, чтение.** Одно окно: недавние книги корешками, вся
  библиотека по вашим полкам или по авторам и страница без лишнего, с тонкой
  полоской прогресса.
- **Страницы или прокрутка.** Проза открывается страницами (на широком окне
  разворотом), техническая литература и Markdown прокруткой. Код подсвечен и
  копируется, формулы TeX и MathML набраны, широкие таблицы прокручиваются,
  картинки увеличиваются.
- **Заметки.** Выделения, заметки и закладки с экспортом в Markdown или JSON.
  Заметки агента отмечены иначе, чем ваши.
- **Типографика.** Шесть встроенных шрифтов с кириллицей, размер, длина строки
  и интерлиньяж, выравнивание и переносы, светлое и тёмное оформление.
- **Сначала клавиатура.** Палитра `Ctrl+K`, команды одной клавишей, клавиши Vim
  по желанию.
- **Быстрый просмотр.** `vibe-reader open notes.md --lite` открывает один файл
  без библиотеки; Markdown обновляется при сохранении.

Подробнее (на английском): [начало работы](docs/user/getting-started.md),
[чтение](docs/user/reading.md), [клавиши](docs/user/keyboard.md).

## Атмосфера

```bash
vibe-reader atmosphere set --book 3 --preset rain
vibe-reader atmosphere set --book 3 --chapter 7 --preset storm
vibe-reader art add 3 ./map.png --locator ch:2:4800 --as page
```

В комплекте семь пресетов: study (кабинет), terminal, noir, soft, rain, storm
и mountain. Профили описываются декларативно в TOML или JSON по проверяемой
схеме: только встроенные шрифты, и ни один профиль не сделает текст
нечитаемым. Остальной интерфейс можно перекрасить на лету файлом
`~/.config/vibe-reader/ui/user.css`. См. [атмосферу](docs/user/atmosphere.md).

## AI-агенты

```bash
vibe-reader skills install            # Claude Code; --dir для других агентов
```

После этого спросите агента о книге. Skills учат его:

| Skill | Назначение |
|---|---|
| `reader-cli` | Безопасно работать с CLI: локаторы, вывод, авторство, отмена. |
| `reader-analyze` | Разбирать книгу или ваше чтение: персонажи, темы, глоссарий, темп. |
| `reader-discuss` | Обсуждать место, где вы читаете, без спойлеров. |
| `reader-atmosphere` | Подбирать пресеты, оформлять главы и сцены, добавлять иллюстрации. |

Агенты читают только до вашей позиции, если вы не попросите иначе, подписывают
всё, что пишут, умеют это отменить, не могут удалять книги и видят ваши
привычки чтения только с вашего разрешения. Текст книг передаётся им как
недоверенные данные. См. [агентов](docs/user/agents.md) и
[справочник CLI](docs/user/cli.md).

## Настройки

Настройки лежат в `~/.config/vibe-reader/config.toml`, библиотека в одном
файле SQLite в `~/.local/share/vibe-reader/`. Ничего не уходит с компьютера.
См. [конфигурацию](docs/user/configuration.md).

## Участие в разработке

Начните с [CONTRIBUTING.md](CONTRIBUTING.md) и
[архитектуры](docs/dev/architecture.md).

## На чём сделано

Rust и [Tauri](https://tauri.app/) с системным webview. Книги разбираются
через `zip`, `quick-xml`, `pulldown-cmark` и `pdf-extract` и очищаются
`ammonia`; библиотека хранится в SQLite через `rusqlite`. Окно использует
[KaTeX](https://katex.org/), [highlight.js](https://highlightjs.org/) и
[pdf.js](https://mozilla.github.io/pdf.js/), шрифты распространяются по
лицензии SIL Open Font License.

## Лицензия

На ваш выбор: [Apache License 2.0](LICENSE-APACHE) или [MIT](LICENSE-MIT).
