[English version](../configuration.md)

# Настройка

## Настройки

Откройте настройки кнопкой **Настройки** на панели библиотеки или клавишами
`Ctrl+,`. В настройках есть такие разделы:

| Раздел | Что внутри |
|---|---|
| Оформление | Тема (Авто, Светлое, Тёмное), язык (Авто, English, Русский), меньше движения, прозрачность окна (от 40 до 100 %). |
| Чтение | Раскладка книг, перелистывание (Лист, Сдвиг, Без анимации), прятать управление при чтении, шрифт, размер, длина строки, интерлиньяж, выравнивание, переносы и живое превью. |
| PDF | Раскладка (Разворот, Одна страница, Прокрутка), размер страницы (Страница целиком, По ширине), тёмные страницы в тёмной теме. |
| Библиотека | Запускать мини-библиотеку, хранить копии добавленных файлов, группировка и порядок, список полок с переименованием, удалением и созданием. |
| Атмосфера | Карточки пресетов по умолчанию, сила эффектов (от 0 до 200 %), частицы, путь к `user.css` и папка пресетов. |
| Звук | Фоновый звук вкл. и выкл., громкость и список звуков (дождь, гроза, огонь, ветер, гул) с кнопкой «Послушать» у каждого. |
| Переводчик | Сервис (DeepL, Google, OpenRouter), ваш ключ для каждого, язык перевода и кнопка «Проверить». |
| AI-агенты | Что видят агенты: привычки чтения, скорость чтения и предпочтения. Всё выключено по умолчанию. Здесь же установка Skills и то, что читалка отправляет агентам. |
| Клавиши | Переключатель клавиш Vim и список сочетаний. |
| О программе | Версия и пути к файлу настроек, папке библиотеки, папке переопределений дизайна и папке пресетов. Щёлчок по пути копирует его. |

Изменения применяются сразу и сохраняются в `config.toml`.

## Где лежат файлы

| Что | Путь по умолчанию |
|---|---|
| База библиотеки | `~/.local/share/vibe-reader/library.db` |
| Кэш разобранных книг | `~/.local/share/vibe-reader/cache/` |
| Обложки | `~/.local/share/vibe-reader/covers/` |
| Иллюстрации | `~/.local/share/vibe-reader/art/` |
| Копии книг | `~/.local/share/vibe-reader/books/` |
| Настройки | `~/.config/vibe-reader/config.toml` |
| Переопределения дизайна | `~/.config/vibe-reader/ui/` |
| Ваши пресеты | `~/.config/vibe-reader/presets/` |

Переменные XDG (`XDG_DATA_HOME`, `XDG_CONFIG_HOME`) переносят эти папки, как
обычно. Чтобы держать всё в одной папке (`data/`, `config/`, `run/`), например
для переносной установки или тестов, задайте `VIBE_READER_HOME`.

`vibe-reader config` выводит действующие настройки, `vibe-reader config path`
показывает путь к файлу, а `vibe-reader config edit` открывает его в `$EDITOR`.

## config.toml

Все ключи необязательны. Если ключа нет, используется значение по умолчанию.

```toml
[reader]
locale = "auto"        # auto, en, ru
preset = "study"
mode = "auto"          # auto, light, dark
vim = false
reduce_motion = false
layout = "spread"      # spread, pages, scroll
particles = true
effects = 1.0          # effect strength, 0 to 2
sound = false          # ambient sound
volume = 0.5           # 0 to 1
page_turn = "curl"     # curl (leaf), slide, none
autohide = true        # hide the dock while reading
opacity = 1.0          # window opacity, 0.4 to 1 in the settings

[typography]
font = "auto"          # auto (from the atmosphere), a bundled font, "system", any installed family
size = 19.0            # px, 14 to 30
width = 34.0           # line length in em, 22 to 50
line_height = 1.6      # 1.2 to 2.2
justify = true
hyphens = true

[library]
group = "shelf"        # shelf, author, format, status, none
sort = "recent"        # recent, title, author, progress, added
start_mini = false
copy_on_import = false

[pdf]
layout = "spread"      # spread, single, scroll
fit = "page"           # page, width
invert_dark = true

[translate]
provider = "deepl"     # deepl, google, openrouter
target = "auto"        # auto = interface language, or a language code
google_key = ""
deepl_key = ""
openrouter_key = ""
openrouter_model = "openai/gpt-4o-mini"

[agent.consent]
habits = false
genres = false
speed = false
```

Ключ `preset` задаёт атмосферу для книг, у которых нет собственной.

## API-ключи

Переводчик отправляет текст выбранному сервису с вашим ключом. Ключи хранятся в
`config.toml`. Файл записывается с правами 0600, поэтому читать его может только
ваш пользователь. `vibe-reader config` выводит каждый ключ как «set» (или пусто) и
никогда не показывает значение. Агенты ключей не получают. См.
[переводчик](translator.md).

## Что видят агенты

Агенты читают ваши книги, заметки и прогресс через CLI. Ваш профиль читателя
(привычки, жанры, скорость) остаётся закрытым, пока вы не включите нужный ключ в
разделе `[agent.consent]`. Те же переключатели есть в Настройках, в разделе
«AI-агенты». Команда `vibe-reader config edit` работает только в интерактивном
терминале, поэтому агент не может сам себе дать доступ.
