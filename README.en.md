# build-switcher

[Русский](README.md) | **English**

A mod for [TERA Toolbox](https://github.com/tera-private-toolbox/tera-toolbox) (patch 100.02, Asura): one button switches your build, e.g. **tank ⇄ DPS**:

| What | How it is switched |
|---|---|
| Glyphs (glyph sets 1–5) | The mod stores the list of enabled glyphs and applies it with `C_CREST_APPLY_LIST`. If the server does not apply everything, the mod finishes one glyph at a time with `C_CREST_APPLY`. |
| Talents (page 1–5) | `C_LOAD_EP_PAGE`. The mod learns this packet when you switch the page yourself in the talent window. |
| Equipment (weapon, armor, accessories, belt, brooch) | The mod remembers your equipped items and puts them on with a single `C_CHANGE_EQUIP_PRESET` packet, like an equipment preset in the client. Costumes are not touched. If an item is not in your bag (e.g. it is in the bank), the mod tells you. |
| Skill advancement (options 1/2/3) | `C_RQ_SKILL_POLISHING_CHANGE_OPTION`. The mod learns this packet when you select an option yourself. |

The packet structures for talents and skill advancement are not described in tera-data, so the mod **learns** them: it stores the packet the client sends and later sends the same one. Toolbox recalculates the integrity hash for padded packets itself.

## Installation

**Option 1. A single file (recommended).**

1. Create the folder `TeraToolbox/mods/build-switcher/`.
2. Put only [`module.json`](https://raw.githubusercontent.com/omk-education/build-switcher/main/module.json) into it (right-click the link → "Save as").
3. Start Toolbox. It will detect the new mod and download the remaining files.

**Option 2. Manually.** Download the repository (Code → Download ZIP) and copy its contents into `TeraToolbox/mods/build-switcher/`.

Your builds and learned packets are stored in `config.json` in the mod folder. Updates never touch this file.

## Updating

The mod is updated by the standard Toolbox mechanism: on every start Toolbox compares the files with `manifest.json` in this repository and downloads the changed ones.

- Auto-update is toggled with the switch next to the mod on the "Installed mods" tab.
- If you installed the mod manually before version 3.1, replace `module.json` with the new one once: the old file had no update server address.
- The current version is shown at the bottom of the settings in the mod window (⚙).

### For developers

`manifest.json` contains the SHA-256 of every mod file. GitHub Actions rebuilds it on every push to `main`. Manually:

```
node tools/manifest.js          # rebuild manifest.json
node tools/manifest.js --check  # check that it is up to date
node tools/i18n-check.js        # check that every string is translated
```

New mod files are added to the manifest automatically. Service files (`.github`, `tools`, `.git*`) and the user's `config.json` are excluded. Bump `version` in `module.json` when you change things.

## First setup (once)

1. Log in to your character.
2. Manually switch to your **tank setup**: glyphs, talent page and the tanking skill advancement options (e.g. the option that lengthens the perfect block window).
   Important: **click them now** instead of leaving them as they were. This way the mod sees the packets and learns them.
3. Type in chat: `/8 build save tank`
4. Do the same for your **DPS setup** (glyphs, talent page and the damage-oriented advancement options).
5. `/8 build save dd`
6. Check: `/8 build show tank` and `/8 build show dd`. If the mod says it "does not know the packets yet", switch the listed things manually in game once.

You can also do all of this in the mod window: set things up in game, type a name and click "Save current".

## Usage

| Command | Action |
|---|---|
| `/8 tank` or `/8 build tank` | switch to tank |
| `/8 dd` or `/8 build dd` | switch to DPS |
| `/8 build save <name>` | save the current state as a build (any name, e.g. `pvp`) |
| `/8 build <name>` | apply a build |
| `/8 build list` | list the character's builds |
| `/8 build show <name>` | build contents and what matches the current state |
| `/8 build status` | current state and learned packets |
| `/8 build del <name>` | delete a build |
| `/8 build gui` | open the window |
| `/8 build lang ru` / `en` | interface and message language |
| `/8 build part <name> <part> on/off` | enable or disable a part of a build: `equip`, `talents`, `crests`, `polish` |
| `/8 build debug` | toggle packet logging (chat and Toolbox log) |
| `/8 build forget` | forget learned packets |
| `/8 build on` / `off` | enable / disable the mod |

## What to switch (build parts)

Each build has four parts: **Equipment**, **Talents**, **Glyphs** and **Advancements** (skill advancement). Any of them can be disabled, and the mod will leave it alone:
- in the window: build editor (✎) → "What to switch", or simply click a chip on the build card (struck through means disabled);
- in chat: `/8 build part tank equip off` (parts: `equip`, `talents`, `crests`, `polish`; `on` or `off`).

Example: you change gear and glyphs yourself, and the mod only switches talents and advancements.

"Overwrite with current" saves all four parts again; the choice of enabled parts stays the same.

## Mod window

The window opens automatically when you enter the game. To open it manually: `/8 build gui`. The window only works in **TeraToolbox.exe** (GUI), not in the CLI.

**Main screen**
- The "Now" block shows which build is active and warns you when you are in combat, an interaction window is open, or a hotkey could not be registered.
- The big icon on a card switches to that build. ✓ and ✗ show what matches the current state.
- The ✎ button opens the build editor: name, what to switch, icon (more than 40 in four groups, plus your own SVGs), color, hotkey, order in the list, "Overwrite with current" and "Delete".
- The result of a switch appears at the bottom: green if everything worked, yellow for warnings, red for errors.

**Title bar buttons:** ⚙ settings, 📌 always on top, ⇲ compact mode, minimize, close.

**Compact mode.** Only the build buttons remain, and the window fits itself to their number and size. Drag it by any empty space. "Expand" and "Close" appear on hover.

**No background or labels.** In settings (⚙ → "Compact mode"):
- "Button background" removes the tile behind the icon, leaving just icons with a soft shadow;
- "Labels under buttons" hides build names;
- "Transparent window" removes the window background so only the buttons are visible over the game. The window restarts when you toggle it, as Electron requires.

**Custom icons (SVG).** Build editor (✎) → "Custom" tab → "+", or drop .svg files into the editor.
- Up to 150 KB per file and up to 60 icons. They are stored in `config.json` and survive updates.
- Single-color icons take the build color. Multicolor icons keep their colors; the "Build color" checkbox fills them with one color.
- Anything that could run code or load something is removed from the file: scripts, event handlers, external links, embedded images, animations. Only shapes, gradients and masks remain.
- Lots of free game icons are available at [game-icons.net](https://game-icons.net) (CC BY 3.0).

**Hotkeys.** They work globally, even when the window is minimized or closed (while Toolbox is running). The combination is captured from all programs, including the game, so pick an unused one: e.g. `Ctrl+Alt+1` or `F9`. Single letters without Ctrl, Alt or Shift are not allowed.

## Settings (⚙ in the window)

| Section | What you can change |
|---|---|
| Window | always on top, open on login, opacity, idle opacity (when the cursor is away), scale, theme (TERA, Graphite, Crimson, Emerald, Light), language |
| Compact mode | button size, button background, labels, transparent window, row or column, hide title bar |
| Switching | no switching in combat, behavior while an interaction window is open, delay between packets, hotkeys |
| Notifications | how long to show results, also post to chat, confirm delete and overwrite |
| Data | forget learned packets, reset window position and opacity |

## Interface language

The window and mod messages are available in Russian (the base language) and English. Switch it in ⚙ → "Window" → "Language", or with `/8 build lang en` (`ru` to go back).

Translations live in `ui/i18n.js`. The translation key is the Russian string, so to add a language, add it to `LANGUAGES` and add a dictionary to `DICT`. `node tools/i18n-check.js` verifies that every string is translated (GitHub Actions runs it too).

## Interaction windows

While an NPC, bank, trade, crafting or similar window is open, the server refuses to change the whole glyph set at once. A manual click on a glyph set in game will not work either; the mod tells you so in chat.

What the mod does in this case is set in settings ("If an interaction window is open"):
- **One by one** (default): sets glyphs one at a time. The server allows this, but it is slower.
- **Skip glyphs**: switches only talents and advancements.
- **Cancel the switch**: does nothing and asks you to close the window.

## Glyphs and glyph sets 1–5

The glyph set number is stored only by the game client. The server receives just the list of glyphs, so a new list is written into the currently selected set. Keep a spare set selected (e.g. set 5): the mod will only change that one. If you want to switch glyphs yourself, disable the "Glyphs" part in the build editor ("What to switch").

The mod changes only what differs. If the glyphs are already right, it leaves them alone.

## The `config.json` file

Almost everything is configured in the window. The only thing worth editing by hand is `shortcuts`: short chat commands (default `["tank", "dd"]`). If you named your builds differently, put their names here.

Builds are stored per character. Learned packets are shared.

## If something does not switch

1. `/8 build debug`
2. Switch the thing that does not work manually in game.
3. Packet names and bodies go to the Toolbox log. Send these lines, and the mod can be fixed based on them.
