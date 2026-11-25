'use strict';

/*
 * Окно мода (Electron через tera-mod-ui) и глобальные горячие клавиши.
 * Работает только в TeraToolbox.exe — в CLI Electron недоступен, тогда всё здесь молча выключено.
 */

const path = require('path');

// Настройки, которые можно менять из окна: [путь, проверка/нормализация]
const int = (min, max) => v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; };
const bool = v => !!v;
const oneOf = (...list) => v => (list.includes(v) ? v : undefined);

const OPTIONS = {
    'gui.alwaysOnTop': bool,
    'gui.autoOpen': bool,
    'gui.compact': bool,
    'gui.opacity': int(30, 100),
    'gui.idleOpacity': int(15, 100),
    'gui.zoom': int(70, 150),
    'gui.iconSize': int(32, 96),
    'gui.labels': bool,
    'gui.layout': oneOf('row', 'column'),
    'gui.autoHideBar': bool,
    'gui.theme': oneOf('tera', 'graphite', 'crimson', 'emerald', 'light'),
    'gui.toastSeconds': int(0, 60),
    'gui.confirmDelete': bool,
    'hotkeysEnabled': bool,
    'chatReports': bool,
    'blockInCombat': bool,
    'delay': int(200, 1500),
    'crestsWhenBusy': oneOf('single', 'skip', 'abort')
};

const ICON_RE = /^[a-z0-9-]{1,24}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

class Gui {
    constructor(core) {
        this.core = core;
        this.mod = core.mod;
        this.host = null;
        this.pushTimer = null;
        this.hovered = false;
        this.hotkeys = new Map(); // accelerator -> build name
        this.electron = null;
        try { this.electron = require('electron'); if (!this.electron.BrowserWindow) this.electron = null; } catch (_) { this.electron = null; }

        this.autoOpened = false;
        this.mod.game.on('enter_game', () => {
            this.registerHotkeys();
            this.changed();
            if (!this.autoOpened && this.S.gui.autoOpen) {
                this.autoOpened = true;
                this.mod.setTimeout(() => this.open(true), 1000);
            }
        });
        this.mod.game.on('leave_game', () => { this.unregisterHotkeys(); this.changed(); });
    }

    get S() { return this.core.settings(); }
    isOpen() { return !!this.host; }
    get window() { return this.host && this.host.window && !this.host.window.isDestroyed() ? this.host.window : null; }

    // ---------------------------------------------------------------- состояние для окна
    changed() {
        if (!this.host || this.pushTimer) return;
        this.pushTimer = this.mod.setTimeout(() => { this.pushTimer = null; this.push(); }, 120);
    }

    push() {
        if (!this.host) return;
        const state = this.core.state();
        const g = this.S.gui;
        state.options = {
            alwaysOnTop: g.alwaysOnTop, autoOpen: g.autoOpen, compact: g.compact,
            opacity: g.opacity, idleOpacity: g.idleOpacity, zoom: g.zoom,
            iconSize: g.iconSize, labels: g.labels, layout: g.layout, autoHideBar: g.autoHideBar,
            theme: g.theme, toastSeconds: g.toastSeconds, confirmDelete: g.confirmDelete,
            hotkeysEnabled: this.S.hotkeysEnabled, chatReports: this.S.chatReports,
            blockInCombat: this.S.blockInCombat, delay: this.S.delay, crestsWhenBusy: this.S.crestsWhenBusy
        };
        state.hotkeysAvailable = !!this.electron;
        try { state.version = require('../module.json').version; } catch (_) { state.version = ''; }
        state.hotkeyErrors = [...this.hotkeyErrors || []];
        this.host.send('state', state);
    }

    // ---------------------------------------------------------------- окно
    open(auto = false) {
        if (this.host) {
            const w = this.window;
            if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
            return;
        }
        if (!this.electron) {
            if (!auto) this.core.msg('Окно доступно только в TeraToolbox.exe (с интерфейсом), в CLI его нет.');
            return;
        }
        const { Host } = require('tera-mod-ui');
        const g = this.S.gui;
        const size = g.compact ? [200, 100] : (g.size || [420, 600]);
        const opts = {
            title: 'Build Switcher',
            width: size[0], height: size[1],
            minWidth: 120, minHeight: 60,
            frame: false, resizable: !g.compact, show: false,
            transparent: false,
            alwaysOnTop: !!g.alwaysOnTop,
            skipTaskbar: false,
            backgroundColor: '#0d1726',
            autoHideMenuBar: true,
            icon: path.join(__dirname, '..', 'ui', 'icon.png'),
            webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false }
        };
        const pos = this.validPosition(g.position);
        if (pos) { opts.x = pos[0]; opts.y = pos[1]; }

        this.host = new Host(this.mod, 'ui/index.html', opts, false, path.join(__dirname, '..'));
        this.bindEvents();
        this.host.show();

        const w = this.window;
        if (!w) return;
        w.setAlwaysOnTop(!!g.alwaysOnTop, 'screen-saver');
        w.once('ready-to-show', () => { this.applyOpacity(); w.showInactive ? w.showInactive() : w.show(); });
        const remember = () => {
            if (!this.window || w.isMinimized()) return;
            this.S.gui.position = w.getPosition();
            if (!this.S.gui.compact) this.S.gui.size = w.getSize();
            this.core.save();
        };
        w.on('moved', remember);
        w.on('resized', remember);
        w.on('closed', () => { this.host = null; });
    }

    close() {
        const h = this.host;
        this.host = null;
        if (h) { try { h.close(); } catch (_) { /* уже закрыто */ } }
    }

    destroy() {
        this.close();
        this.unregisterHotkeys();
    }

    validPosition(pos) {
        if (!Array.isArray(pos) || !this.electron || !this.electron.screen) return null;
        try {
            const [x, y] = pos;
            const ok = this.electron.screen.getAllDisplays().some(d => {
                const a = d.workArea;
                return x >= a.x - 40 && y >= a.y - 10 && x < a.x + a.width - 60 && y < a.y + a.height - 30;
            });
            return ok ? pos : null;
        } catch (_) { return null; }
    }

    applyOpacity() {
        const w = this.window;
        if (!w) return;
        const g = this.S.gui;
        const full = (g.opacity || 100) / 100;
        const idle = Math.min(full, (g.idleOpacity || 100) / 100);
        try { w.setOpacity(this.hovered ? full : idle); } catch (_) { /* не поддерживается ОС */ }
    }

    applyMode() {
        const w = this.window;
        if (!w) return;
        const g = this.S.gui;
        w.setAlwaysOnTop(!!g.alwaysOnTop, 'screen-saver');
        w.setResizable(!g.compact);
        if (!g.compact) {
            const size = g.size || [420, 600];
            w.setMinimumSize(320, 360);
            w.setSize(size[0], size[1]);
        } else {
            w.setMinimumSize(60, 40);
        }
        this.applyOpacity();
    }

    bindEvents() {
        const h = this.host, core = this.core;
        h.on('ready', () => this.push());
        h.on('apply', name => core.applyBuild(name, 'gui'));
        h.on('save', name => {
            name = String(name || '').trim();
            if (!core.validName(name)) return core.setReport('Имя билда: буквы, цифры, «-» и «_», до 24 символов.', 'error');
            const missing = core.saveBuild(name);
            if (!missing) core.setReport('Персонаж не определён — зайдите в игру.', 'error');
            else if (missing.length) core.setReport(`«${name}» сохранён без: ${missing.join(', ')}. Откройте эти окна в игре и сохраните ещё раз.`, 'warn');
            else core.setReport(`Билд «${name}» сохранён.`, 'ok');
            this.registerHotkeys();
        });
        h.on('delete', name => {
            if (core.deleteBuild(name)) { core.setReport(`Билд «${name}» удалён.`, 'ok'); this.registerHotkeys(); }
        });
        h.on('rename', (from, to) => {
            const err = core.renameBuild(from, to);
            if (err) core.setReport(err, 'error');
            else this.registerHotkeys();
        });
        h.on('move', (name, dir) => core.moveBuild(name, dir));
        h.on('update', (name, patch) => this.updateBuild(name, patch || {}));
        h.on('setting', (key, value) => this.setOption(key, value));
        h.on('forget', () => { core.forgetLearned(); core.setReport('Выученные пакеты забыты. Переключите всё в игре вручную один раз.', 'warn'); });
        h.on('resetWindow', () => {
            Object.assign(this.S.gui, { position: null, size: null, opacity: 100, idleOpacity: 100, zoom: 100, compact: false });
            this.core.save();
            const w = this.window;
            if (w) { w.center(); this.applyMode(); }
            this.push();
        });
        h.on('hover', on => { this.hovered = !!on; this.applyOpacity(); });
        h.on('fit', (width, height) => {
            const w = this.window;
            if (!w || !this.S.gui.compact) return;
            const W = Math.max(60, Math.min(2000, Math.ceil(width))), H = Math.max(40, Math.min(1500, Math.ceil(height)));
            w.setContentSize(W, H);
        });
        h.on('minimize', () => { const w = this.window; if (w) w.minimize(); });
        h.on('close', () => this.close());
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

        if (['gui.alwaysOnTop', 'gui.compact'].includes(key)) this.applyMode();
        if (['gui.opacity', 'gui.idleOpacity'].includes(key)) this.applyOpacity();
        if (key === 'hotkeysEnabled') this.registerHotkeys();
        this.push();
    }

    updateBuild(name, patch) {
        const clean = {};
        if ('icon' in patch && ICON_RE.test(String(patch.icon))) clean.icon = String(patch.icon);
        if ('color' in patch && (patch.color === '' || COLOR_RE.test(String(patch.color)))) clean.color = String(patch.color);
        if ('useCrests' in patch) clean.useCrests = !!patch.useCrests;
        if ('hotkey' in patch) {
            const key = String(patch.hotkey || '');
            if (key) {
                const builds = this.core.builds();
                const taken = Object.entries(builds).find(([n, b]) => n !== name && b.hotkey === key);
                if (taken) return this.core.setReport(`Клавиша ${key} уже назначена билду «${taken[0]}».`, 'error');
                if (!this.testHotkey(key)) return this.core.setReport(`Клавишу ${key} занял другой процесс или она не поддерживается. Выберите другую.`, 'error');
            }
            clean.hotkey = key;
        }
        this.core.updateBuild(name, clean);
        if ('hotkey' in clean) this.registerHotkeys();
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
