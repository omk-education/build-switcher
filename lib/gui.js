'use strict';

/*
 * Окна мода и глобальные горячие клавиши. Работает только в TeraToolbox.exe:
 * в CLI Electron недоступен, тогда всё здесь молча выключено.
 *
 * Два окна:
 *   bar     — панель кнопок билдов поверх игры (ui/bar.html): маленькая, без рамки, может быть прозрачной
 *             и не забирать фокус у игры;
 *   manager — окно управления (ui/index.html): билды, редактор, настройки.
 *
 * IPC свой (канал build-switcher): сообщение принимается, только если пришло от webContents
 * одного из наших окон — так два окна (и окна других модов) не путаются.
 */

const path = require('path');
const crypto = require('crypto');
const { LANGUAGES } = require('../ui/i18n.js');

const CHANNEL = 'build-switcher';
const UI_DIR = path.join(__dirname, '..', 'ui');

// Настройки, которые можно менять из окна: путь -> проверка/нормализация
const int = (min, max) => v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };
const bool = v => !!v;
const oneOf = (...list) => v => (list.includes(v) ? v : undefined);

const OPTIONS = {
    // панель кнопок
    'gui.barOnLogin': bool,
    'gui.barOnTop': bool,
    'gui.barNoFocus': bool,
    'gui.barLocked': bool,
    'gui.hideUnfocused': bool,
    'gui.opacity': int(30, 100),
    'gui.idleOpacity': int(15, 100),
    'gui.iconSize': int(32, 96),
    'gui.labels': bool,
    'gui.layout': oneOf('row', 'column'),
    'gui.buttonBg': bool,
    'gui.buttonBgColor': v => (v === '' || /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : undefined),
    'gui.buttonBgOpacity': int(0, 100),
    'gui.buttonBorder': bool,
    'gui.transparentBg': bool,
    // окно управления
    'gui.managerOnLogin': bool,
    'gui.managerOnTop': bool,
    // общее
    'gui.zoom': int(70, 150),
    'gui.theme': oneOf('tera', 'graphite', 'crimson', 'emerald', 'light'),
    'gui.toastSeconds': int(0, 60),
    'gui.confirmDelete': bool,
    'hotkeysEnabled': bool,
    'chatReports': bool,
    'blockInCombat': bool,
    'delay': int(200, 1500),
    'crestsWhenBusy': oneOf('single', 'skip', 'abort'),
    'summonOnLogin': bool,
    'language': oneOf(...Object.keys(LANGUAGES))
};
// Изменение этих настроек требует пересоздать панель (Electron задаёт их только при создании окна)
const BAR_RECREATE = ['gui.transparentBg', 'gui.barNoFocus'];

const PARTS = ['equip', 'costume', 'servant', 'cards', 'talents', 'crests', 'polish'];
const ICON_RE = /^[a-z0-9-]{1,24}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

// Свои иконки (SVG). Окна имеют доступ к Node.js, поэтому SVG проверяется дважды:
// окно чистит его по белому списку, а здесь отклоняем всё, что может выполнить код или загрузить внешний ресурс.
const MAX_SVG = 150 * 1024;
const MAX_CUSTOM_ICONS = 60;
const SVG_DENY = /<script|<foreignObject|<iframe|<embed|<object|<image|<audio|<video|<animate|<set\b|<!ENTITY|<!DOCTYPE|<\?|\son[a-z]+\s*=|javascript:|data:|@import|(?:xlink:)?href\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i;
function validSvg(svg) {
    return typeof svg === 'string' && svg.length > 20 && svg.length <= MAX_SVG && /^<svg[\s>]/.test(svg) && /<\/svg>$/.test(svg) && !SVG_DENY.test(svg);
}

// ---------------------------------------------------------------- одно окно
class Win {
    constructor(gui, kind) {
        this.gui = gui;
        this.kind = kind;
        this.window = null;
        this.hovered = false;
        this.transparent = false;
    }

    get alive() { return !!(this.window && !this.window.isDestroyed()); }

    send(name, ...args) {
        if (this.alive) this.window.webContents.send(CHANNEL, name, ...args);
    }

    open() {
        const { BrowserWindow } = this.gui.electron;
        if (this.alive) {
            if (this.window.isMinimized()) this.window.restore();
            this.kind === 'bar' ? this.window.showInactive() : (this.window.show(), this.window.focus());
            return;
        }
        const g = this.gui.S.gui;
        const isBar = this.kind === 'bar';
        this.transparent = isBar && !!g.transparentBg;
        const size = isBar ? [200, 90] : (g.size || [440, 640]);
        const opts = {
            title: isBar ? 'Build Switcher' : 'Build Switcher — управление',
            width: size[0], height: size[1],
            minWidth: isBar ? 40 : 360, minHeight: isBar ? 30 : 420,
            frame: false, show: false,
            resizable: !isBar,
            transparent: this.transparent,
            backgroundColor: this.transparent ? '#00000000' : '#0d1726',
            hasShadow: !this.transparent,
            alwaysOnTop: !!(isBar ? g.barOnTop : g.managerOnTop),
            skipTaskbar: isBar,
            focusable: isBar ? !g.barNoFocus : true,
            autoHideMenuBar: true,
            icon: path.join(UI_DIR, 'icon.png'),
            webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
        };
        const pos = this.gui.validPosition(isBar ? g.barPosition : g.position);
        if (pos) { opts.x = pos[0]; opts.y = pos[1]; }

        const w = this.window = new BrowserWindow(opts);
        w.loadFile(path.join(UI_DIR, isBar ? 'bar.html' : 'index.html'));
        this.applyOnTop();
        w.once('ready-to-show', () => {
            this.applyOpacity();
            if (isBar && g.barNoFocus) w.showInactive(); else w.show();
        });
        const remember = () => {
            if (!this.alive || w.isMinimized()) return;
            if (isBar) this.gui.S.gui.barPosition = w.getPosition();
            else { this.gui.S.gui.position = w.getPosition(); this.gui.S.gui.size = w.getSize(); }
            this.gui.core.save();
        };
        w.on('moved', remember);
        w.on('resized', remember);
        w.on('closed', () => { if (this.window === w) this.window = null; this.gui.changed(); });
    }

    close() {
        const w = this.window;
        this.window = null;
        if (w && !w.isDestroyed()) { try { w.close(); } catch (_) { /* уже закрыто */ } }
    }

    applyOnTop() {
        if (!this.alive) return;
        const g = this.gui.S.gui;
        this.window.setAlwaysOnTop(!!(this.kind === 'bar' ? g.barOnTop : g.managerOnTop), 'screen-saver');
    }

    // Прозрачность только у панели: «в покое» (курсор не над окном) она может быть прозрачнее
    applyOpacity() {
        if (!this.alive || this.kind !== 'bar') return;
        const g = this.gui.S.gui;
        const full = (g.opacity || 100) / 100;
        const idle = Math.min(full, (g.idleOpacity || 100) / 100);
        try { this.window.setOpacity(this.hovered ? full : idle); } catch (_) { /* не поддерживается ОС */ }
    }

    // Перетаскивание панели: окно двигается за реальным курсором (screen.getCursorScreenPoint),
    // так оно работает и в маленьком окне без рамки, и когда панель не забирает фокус.
    dragStart() {
        if (!this.alive || this.kind !== 'bar' || this.gui.S.gui.barLocked) return;
        this.drag = { cursor: this.gui.electron.screen.getCursorScreenPoint(), pos: this.window.getPosition() };
    }
    dragMove() {
        if (!this.alive || !this.drag) return;
        const c = this.gui.electron.screen.getCursorScreenPoint();
        this.window.setPosition(Math.round(this.drag.pos[0] + c.x - this.drag.cursor.x), Math.round(this.drag.pos[1] + c.y - this.drag.cursor.y));
    }
    dragEnd() {
        if (!this.alive || !this.drag) return;
        this.dragMove();
        this.drag = null;
        this.gui.S.gui.barPosition = this.window.getPosition();
        this.gui.core.save();
    }

    fit(width, height) {
        if (!this.alive || this.kind !== 'bar') return;
        const W = Math.max(40, Math.min(2000, Math.ceil(width))), H = Math.max(30, Math.min(1500, Math.ceil(height)));
        this.window.setContentSize(W, H);
    }
}

// ---------------------------------------------------------------- оба окна + горячие клавиши
class Gui {
    constructor(core) {
        this.core = core;
        this.mod = core.mod;
        this.pushTimer = null;
        this.hotkeys = new Map(); // accelerator -> build name
        this.hotkeyErrors = [];
        this.electron = null;
        try { this.electron = require('electron'); if (!this.electron.BrowserWindow || !this.electron.ipcMain) this.electron = null; } catch (_) { this.electron = null; }

        this.bar = new Win(this, 'bar');
        this.manager = new Win(this, 'manager');

        if (this.electron) {
            this.onIpc = (event, name, ...args) => {
                const win = [this.bar, this.manager].find(w => w.alive && event.sender === w.window.webContents);
                if (win) this.handle(win, name, args);
            };
            this.electron.ipcMain.on(CHANNEL, this.onIpc);
        }

        this.loggedIn = false;
        this.mod.game.on('enter_game', () => {
            this.registerHotkeys();
            this.changed();
            if (this.loggedIn) return; // окна открываем при первом входе за сессию
            this.loggedIn = true;
            const g = this.S.gui;
            this.mod.setTimeout(() => {
                if (g.barOnLogin) this.openBar(true);
                if (g.managerOnLogin) this.openManager(true);
            }, 1000);
        });
        // Toolbox при leave_game (смена персонажа, выход) снимает ВСЕ таймеры мода. Ссылки на них
        // остались бы «занятыми» навсегда: панель перестала бы обновляться, слежение за фокусом — работать.
        // Сбрасываем их и запускаем заново уже после всех обработчиков leave_game.
        this.mod.game.on('leave_game', () => {
            this.unregisterHotkeys();
            this.pushTimer = null;
            this.focusTimer = null;
            this.focusPending = false;
            setImmediate(() => { this.updateFocusWatch(); this.changed(); });
        });

        this.focusTimer = null;
        this.focusPending = false;
        this.barHidden = false;
    }

    get S() { return this.core.settings(); }
    isOpen() { return this.bar.alive || this.manager.alive; }
    managerOpen() { return this.manager.alive && this.manager.window.isVisible() && !this.manager.window.isMinimized(); }

    // ---------------------------------------------------------------- открыть / закрыть
    available(auto) {
        if (this.electron) return true;
        if (!auto) this.core.msg(this.core.T('Окно доступно только в TeraToolbox.exe (с интерфейсом), в CLI его нет.'));
        return false;
    }
    openBar(auto = false) { if (this.available(auto)) { this.bar.open(); this.barHidden = false; this.updateFocusWatch(); this.changed(); } }
    openManager(auto = false) { if (this.available(auto)) { this.manager.open(); this.changed(); } }
    toggleLock() {
        this.setOption('gui.barLocked', !this.S.gui.barLocked);
        return !!this.S.gui.barLocked;
    }
    toggleBar() { if (this.bar.alive) { this.bar.close(); this.updateFocusWatch(); this.changed(); } else this.openBar(); }

    destroy() {
        this.stopFocusWatch();
        this.bar.close();
        this.manager.close();
        this.unregisterHotkeys();
        if (this.electron && this.onIpc) this.electron.ipcMain.removeListener(CHANNEL, this.onIpc);
    }

    // ---------------------------------------------------------------- скрывать панель, когда игра неактивна
    // Клиентский интерфейс Toolbox спрашивает у игры, в фокусе ли её окно (hasFocus).
    // Если активно окно самого мода (панель или окно управления), панель не прячем.
    updateFocusWatch() {
        const need = this.bar.alive && this.S.gui.hideUnfocused && this.mod.clientInterface && typeof this.mod.clientInterface.hasFocus === 'function';
        if (need && !this.focusTimer) this.focusTimer = this.mod.setInterval(() => this.checkFocus(), 500);
        if (!need) this.stopFocusWatch();
    }

    stopFocusWatch() {
        if (this.focusTimer) { this.mod.clearInterval(this.focusTimer); this.focusTimer = null; }
        this.setBarHidden(false);
    }

    async checkFocus() {
        if ((this.focusPending && Date.now() - this.focusAt < 3000) || !this.bar.alive) return;
        this.focusPending = true;
        this.focusAt = Date.now();
        try {
            const focus = await Promise.race([
                this.mod.clientInterface.hasFocus(),
                new Promise(resolve => this.mod.setTimeout(() => resolve(null), 1000))
            ]);
            if (focus === null || focus === undefined) return; // игра не ответила — ничего не меняем
            const own = [this.bar, this.manager].some(w => w.alive && w.window.isFocused());
            this.setBarHidden(!focus && !own);
        } catch (_) { /* интерфейс клиента недоступен */ } finally {
            this.focusPending = false;
        }
    }

    setBarHidden(hidden) {
        if (hidden === this.barHidden) return;
        this.barHidden = hidden;
        if (!this.bar.alive) return;
        if (hidden) this.bar.window.hide(); else this.bar.window.showInactive();
    }

    validPosition(pos) {
        if (!Array.isArray(pos) || !this.electron || !this.electron.screen) return null;
        try {
            const [x, y] = pos;
            const ok = this.electron.screen.getAllDisplays().some(d => {
                const a = d.workArea;
                return x >= a.x - 40 && y >= a.y - 10 && x < a.x + a.width - 30 && y < a.y + a.height - 20;
            });
            return ok ? pos : null;
        } catch (_) { return null; }
    }

    // ---------------------------------------------------------------- состояние для окон
    changed() {
        if (!this.isOpen()) return;
        // Таймер мог быть снят без нашего ведома — не ждём его дольше секунды
        if (this.pushTimer && Date.now() - this.pushAt < 1000) return;
        this.pushAt = Date.now();
        this.pushTimer = this.mod.setTimeout(() => { this.pushTimer = null; this.push(); }, 120);
    }

    push() {
        if (!this.isOpen()) return;
        const state = this.core.state();
        const g = this.S.gui;
        state.options = {
            barOnLogin: g.barOnLogin, barOnTop: g.barOnTop, barNoFocus: g.barNoFocus, barLocked: !!g.barLocked, hideUnfocused: !!g.hideUnfocused,
            opacity: g.opacity, idleOpacity: g.idleOpacity, iconSize: g.iconSize, labels: g.labels, layout: g.layout,
            buttonBg: g.buttonBg !== false, transparentBg: !!g.transparentBg,
            buttonBgColor: g.buttonBgColor || '', buttonBgOpacity: g.buttonBgOpacity === undefined ? 100 : g.buttonBgOpacity,
            buttonBorder: g.buttonBorder !== false,
            managerOnLogin: g.managerOnLogin, managerOnTop: g.managerOnTop,
            zoom: g.zoom, theme: g.theme, toastSeconds: g.toastSeconds, confirmDelete: g.confirmDelete,
            hotkeysEnabled: this.S.hotkeysEnabled, chatReports: this.S.chatReports,
            blockInCombat: this.S.blockInCombat, delay: this.S.delay, crestsWhenBusy: this.S.crestsWhenBusy, summonOnLogin: this.S.summonOnLogin !== false,
            language: this.S.language || 'ru'
        };
        state.barOpen = this.bar.alive;
        state.hotkeysAvailable = !!this.electron;
        state.hotkeyErrors = [...this.hotkeyErrors];
        state.customIcons = this.S.customIcons || {};
        try { state.version = require('../module.json').version; } catch (_) { state.version = ''; }
        this.bar.send('state', state);
        this.manager.send('state', state);
    }

    // ---------------------------------------------------------------- сообщения от окон
    handle(win, name, args) {
        const core = this.core, T = core.T;
        switch (name) {
            case 'ready': this.push(); break;
            case 'apply': core.applyBuild(args[0], win.kind); break;

            // окно
            case 'hover': win.hovered = !!args[0]; win.applyOpacity(); break;
            case 'fit': win.fit(args[0], args[1]); break;
            case 'dragStart': win.dragStart(); break;
            case 'dragMove': win.dragMove(); break;
            case 'dragEnd': win.dragEnd(); break;
            case 'minimize': if (win.alive) win.window.minimize(); break;
            case 'close': win.close(); this.updateFocusWatch(); this.changed(); break;
            case 'openManager': this.openManager(); break;
            case 'toggleBar': this.toggleBar(); break;
            case 'toggleLock': this.setOption('gui.barLocked', !this.S.gui.barLocked); break;
            case 'resetWindow': {
                Object.assign(this.S.gui, { position: null, size: null, barPosition: null, opacity: 100, idleOpacity: 100, zoom: 100 });
                core.save();
                for (const w of [this.bar, this.manager]) if (w.alive) { w.window.center(); w.applyOpacity(); }
                if (this.manager.alive) this.manager.window.setSize(440, 640);
                this.push();
                break;
            }

            // билды
            case 'save': {
                const bname = String(args[0] || '').trim();
                if (!core.validName(bname)) return core.setReport(T('Имя билда: буквы, цифры, «-» и «_», до 24 символов.'), 'error');
                const missing = core.saveBuild(bname);
                if (!missing) core.setReport(T('Персонаж не определён — зайдите в игру.'), 'error');
                else if (missing.length) core.setReport(T('«{name}» сохранён без: {list}. Откройте эти окна в игре и сохраните ещё раз.', { name: bname, list: missing.join(', ') }), 'warn');
                else core.setReport(T('Билд «{name}» сохранён.', { name: bname }), 'ok');
                this.registerHotkeys();
                break;
            }
            case 'delete':
                if (core.deleteBuild(args[0])) { core.setReport(T('Билд «{name}» удалён.', { name: args[0] }), 'ok'); this.registerHotkeys(); }
                break;
            case 'rename': {
                const err = core.renameBuild(args[0], args[1]);
                if (err) core.setReport(err, 'error'); else this.registerHotkeys();
                break;
            }
            case 'move': core.moveBuild(args[0], args[1]); break;
            case 'scope': {
                const err = core.setScope(args[0], args[1] === 'shared' ? 'shared' : 'char');
                if (err) core.setReport(err, 'error'); else this.registerHotkeys();
                break;
            }
            case 'update': this.updateBuild(args[0], args[1] || {}); break;
            case 'setting': this.setOption(args[0], args[1]); break;
            case 'forget':
                core.forgetLearned();
                core.setReport(T('Выученные пакеты забыты. Переключите всё в игре вручную один раз.'), 'warn');
                break;

            // свои иконки
            case 'addIcon': this.addIcon(args[0], args[1], args[2], args[3]); break;
            case 'deleteIcon': this.deleteIcon(args[0]); break;
            case 'iconTint': {
                const icons = this.S.customIcons || {};
                if (icons[args[0]]) { icons[args[0]].tint = !!args[1]; core.save(); this.push(); }
                break;
            }
        }
    }

    setOption(key, value) {
        const check = OPTIONS[key];
        if (!check) return;
        const v = check(value);
        if (v === undefined) return;
        const parts = key.split('.');
        const target = parts.length === 2 ? this.S[parts[0]] : this.S;
        target[parts[parts.length - 1]] = v;
        this.core.save();

        if (BAR_RECREATE.includes(key) && this.bar.alive) {
            this.bar.close();
            this.mod.setTimeout(() => this.openBar(true), 150);
        }
        if (key === 'gui.barOnTop') this.bar.applyOnTop();
        if (key === 'gui.managerOnTop') this.manager.applyOnTop();
        if (key === 'gui.opacity' || key === 'gui.idleOpacity') this.bar.applyOpacity();
        if (key === 'hotkeysEnabled') this.registerHotkeys();
        if (key === 'gui.hideUnfocused') this.updateFocusWatch();
        this.push();
    }

    updateBuild(name, patch) {
        const clean = {};
        if ('icon' in patch && ICON_RE.test(String(patch.icon))) clean.icon = String(patch.icon);
        if ('color' in patch && (patch.color === '' || COLOR_RE.test(String(patch.color)))) clean.color = String(patch.color);
        if ('useCrests' in patch) clean.useCrests = !!patch.useCrests;
        if ('showOnBar' in patch) clean.showOnBar = !!patch.showOnBar;
        if (patch.parts && typeof patch.parts === 'object') {
            clean.parts = {};
            for (const k of PARTS) if (k in patch.parts) clean.parts[k] = !!patch.parts[k];
        }
        if ('hotkey' in patch) {
            const key = String(patch.hotkey || '');
            if (key) {
                const builds = this.core.builds();
                const taken = Object.entries(builds).find(([n, b]) => n !== name && b.hotkey === key);
                if (taken) return this.core.setReport(this.core.T('Клавиша {key} уже назначена билду «{name}».', { key, name: taken[0] }), 'error');
                if (!this.testHotkey(key)) return this.core.setReport(this.core.T('Клавишу {key} занял другой процесс или она не поддерживается. Выберите другую.', { key }), 'error');
            }
            clean.hotkey = key;
        }
        this.core.updateBuild(name, clean);
        if ('hotkey' in clean) this.registerHotkeys();
    }

    // ---------------------------------------------------------------- свои иконки
    addIcon(name, svg, tint, assignTo) {
        const T = this.core.T;
        if (!validSvg(svg)) return this.core.setReport(T('Файл не похож на безопасную SVG-иконку (скрипты, внешние ссылки и встроенные картинки не допускаются, размер до 150 КБ).'), 'error');
        const icons = this.S.customIcons || (this.S.customIcons = {});
        if (Object.keys(icons).length >= MAX_CUSTOM_ICONS) return this.core.setReport(T('Можно загрузить не больше {n} своих иконок. Удалите ненужные.', { n: MAX_CUSTOM_ICONS }), 'error');
        const id = 'c-' + crypto.createHash('sha1').update(svg).digest('hex').slice(0, 10);
        const title = String(name || T('Иконка')).replace(/\.svg$/i, '').replace(/[<>"'&]/g, '').slice(0, 32) || T('Иконка');
        icons[id] = { name: title, svg, tint: !!tint };
        this.core.save();
        if (assignTo) this.core.updateBuild(assignTo, { icon: id });
        this.core.setReport(T('Иконка «{name}» загружена.', { name: title }), 'ok');
        this.push();
    }

    deleteIcon(id) {
        const icons = this.S.customIcons || {};
        if (!icons[id]) return;
        const title = icons[id].name;
        delete icons[id];
        for (const b of Object.values(this.core.allBuilds())) if (b.icon === id) delete b.icon;
        this.core.save();
        this.core.setReport(this.core.T('Иконка «{name}» удалена.', { name: title }), 'ok');
        this.push();
    }

    // ---------------------------------------------------------------- горячие клавиши
    testHotkey(accel) {
        if (!this.electron) return true; // в CLI просто сохраняем
        const gs = this.electron.globalShortcut;
        if (this.hotkeys.has(accel)) return true;
        try {
            const ok = gs.register(accel, () => {});
            if (ok) gs.unregister(accel);
            return ok;
        } catch (_) { return false; }
    }

    unregisterHotkeys() {
        if (!this.electron) return;
        for (const accel of this.hotkeys.keys()) { try { this.electron.globalShortcut.unregister(accel); } catch (_) { /* */ } }
        this.hotkeys.clear();
    }

    registerHotkeys() {
        if (!this.electron) return;
        this.unregisterHotkeys();
        this.hotkeyErrors = [];
        if (!this.S.hotkeysEnabled || !this.core.charName()) { this.changed(); return; }
        for (const [name, b] of Object.entries(this.core.builds())) {
            if (!b.hotkey) continue;
            try {
                const ok = this.electron.globalShortcut.register(b.hotkey, () => this.core.applyBuild(name, 'hotkey'));
                if (ok) this.hotkeys.set(b.hotkey, name); else this.hotkeyErrors.push(b.hotkey);
            } catch (_) { this.hotkeyErrors.push(b.hotkey); }
        }
        this.changed();
    }
}

module.exports = Gui;
