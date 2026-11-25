# build-switcher

[Русский](README.md) | **English**

A mod for [TERA Toolbox](https://github.com/tera-private-toolbox/tera-toolbox) (patch 100.02, Asura): one button switches your build, e.g. **tank ⇄ DPS**:

| What | How it is switched |
|---|---|
| Glyphs (glyph sets 1–5) | The mod stores the list of enabled glyphs and applies it with `C_CREST_APPLY_LIST`. If the server does not apply everything, the mod finishes one glyph at a time with `C_CREST_APPLY`. |
| Talents (page 1–5) | `C_LOAD_EP_PAGE`. The mod learns this packet when you switch the page yourself in the talent window. |
| Equipment (weapon, armor, accessories, belt, brooch) | The mod remembers your equipped items and puts them on with a single `C_CHANGE_EQUIP_PRESET` packet, like an equipment preset in the client. If an item is not in your bag (e.g. it is in the bank), the mod tells you. |
| Costumes (head, face, weapon skin, costume, back, footprints) | A separate build part, applied with the same packet. Switch them together with equipment or on their own. |
| Card preset | The mod remembers the number of the active card preset and switches the preset itself (`C_CHANGE_CARD_PRESET`), like the preset buttons in the card window. Cards inside presets are not changed. |
| Servant (pet or partner) | The mod remembers the summoned servant and summons it with `C_REQUEST_SPAWN_SERVANT` if it is not out. The servant of the last applied build is also summoned when you enter the game. |
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
| `/8 build bar` | show or hide the button bar |
| `/8 build lock` | lock or unlock the button bar |
| `/8 build gui` | open the manager window |
| `/8 build lang ru` / `en` | interface and message language |
| `/8 build part <name> <part> on/off` | enable or disable a part of a build: `equip`, `costume`, `servant`, `cards`, `talents`, `crests`, `polish` |
| `/8 build debug` | toggle packet logging (chat and Toolbox log) |
| `/8 build forget` | forget learned packets |
| `/8 build on` / `off` | enable / disable the mod |

## What to switch (build parts)

Each build has seven parts: **Equipment**, **Costumes**, **Servant**, **Cards** (card preset number), **Talents**, **Glyphs** and **Advancements** (skill advancement). Any of them can be disabled, and the mod will leave it alone:
- in the window: build editor (✎) → "What to switch", or simply click a chip on the build card (struck through means disabled);
- in chat: `/8 build part tank equip off` (parts: `equip`, `costume`, `servant`, `cards`, `talents`, `crests`, `polish`; `on` or `off`).

Example: you change gear and glyphs yourself, and the mod only switches talents and advancements.

"Overwrite with current" saves all parts again; enabled parts, icon, hotkey and bar visibility stay the same.

## Servant

Summon the servant (pet or partner) you want before saving a build: the mod stores it with the build. When you switch to the build, the mod summons that servant if it is not out yet.

When you enter the game, the mod summons the servant of the last applied build (⚙ → "Switching" → "Summon the servant when entering the game"). If another mod (e.g. auto-pet) has already summoned it, the mod does not summon it again. To keep mods from taking turns, leave summoning on login enabled in only one of them.

## Mod windows

The windows only work in **TeraToolbox.exe** (GUI), not in the CLI.

**Button bar**: a small window over the game with just the build buttons. It appears when you enter the game; hide and show it with `/8 build bar`.
- Clicking a button switches to that build. The active build is highlighted in gold. The button tooltip shows its hotkey.
- The bar shows builds with "Show on the button bar" enabled (a switch in the build editor). Hidden builds are marked "not on bar" in the manager window.
- "Hide when the game is inactive": the bar disappears when you switch to another window or minimize the game, and comes back when you return. While the manager window is active, the bar stays visible.
- By default the bar does not take focus from the game, so you can keep playing right after clicking.
- Dragging: press the mouse button anywhere on the bar (even on a build button) and move. A move shorter than 5 pixels counts as a normal click. The position is remembered.
- To avoid moving the bar by accident, lock it: the lock on the bar, ⚙ → "Lock the bar" or `/8 build lock`. A locked bar does not move, while its buttons work as usual.
- On hover, 🔒 (lock or unlock), ⚙ (manager window) and × (hide the bar) appear above the icons.
- The bar fits itself to the number and size of buttons.
- In settings you can remove the button background or pick its color (palette or custom) and opacity, remove the border and labels, make the bar transparent (only the buttons are visible over the game), pick the size and layout (row or column) and the idle opacity.

**Manager window**: builds, editor and settings. Open it with ⚙ on the bar or `/8 build gui`.
- The "Now" block shows which build is active and warns you when you are in combat, an interaction window is open, or a hotkey could not be registered.
- The big icon on a card switches to that build. ✓ and ✗ show what matches the current state; the chips enable and disable build parts.
- The ✎ button opens the build editor: name, what to switch, icon (more than 40 in four groups, plus your own SVGs), color, hotkey, order in the list, "Overwrite with current" and "Delete".
- Title bar buttons: ⚙ settings, ▭▭▭ show or hide the button bar, 📌 always on top, minimize, close.

**Custom icons (SVG).** Build editor (✎) → "Custom" tab → "+", or drop .svg files into the editor.
- Up to 150 KB per file and up to 60 icons. They are stored in `config.json` and survive updates.
- Single-color icons take the build color. Multicolor icons keep their colors; the "Build color" checkbox fills them with one color.
- Anything that could run code or load something is removed from the file: scripts, event handlers, external links, embedded images, animations.
- Lots of free game icons are available at [game-icons.net](https://game-icons.net) (CC BY 3.0).

**Hotkeys.** They work globally, even when the windows are minimized or closed (while Toolbox is running). The combination is captured from all programs, including the game, so pick an unused one: e.g. `Ctrl+Alt+1` or `F9`. Single letters without Ctrl, Alt or Shift are not allowed.

## Settings (⚙ in the window)

| Section | What you can change |
|---|---|
| Button bar | show on login, always on top, keep the game focused, hide when the game is inactive, lock the bar, button size, button background (on/off, color, opacity), button border, labels, transparent bar, row or column, opacity and idle opacity |
| Manager window | open on login, always on top, scale, theme (TERA, Graphite, Crimson, Emerald, Light), language |
| Switching | summon the servant on login, no switching in combat, behavior while an interaction window is open, delay between packets, hotkeys |
| Notifications | how long to show results, also post to chat, confirm delete and overwrite |
| Data | forget learned packets, reset window positions and opacity |

## Interface language

The window and mod messages are available in Russian (the base language) and English. Switch it in ⚙ → "Manager window" → "Language", or with `/8 build lang en` (`ru` to go back).

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
