'use strict';

/* global ICON_GROUPS, ICONS, ICON_COLORS, DEFAULT_COLOR, installIcons, installCustomIcons, sanitizeSvg, iconEl */

// ---------------------------------------------------------------- связь с модом
const CHANNEL = 'tera-mod-ui-ipc';
let ipc = null, webFrame = null;
try { const e = require('electron'); ipc = e.ipcRenderer; webFrame = e.webFrame; } catch (_) { /* предпросмотр в браузере */ }

const handlers = {};
function send(name, ...args) { if (ipc) ipc.send(CHANNEL, name, ...args); else if (window.__preview) window.__preview(name, ...args); }
if (ipc) ipc.on(CHANNEL, (event, name, ...args) => { if (handlers[name]) handlers[name](...args); });

const $ = id => document.getElementById(id);
installIcons();

let state = null;
let view = 'main';            // main | settings
let editing = null;           // имя билда в редакторе
const CUSTOM_TAB = 'Свои';
let iconTab = ICON_GROUPS[0].name;
let lastToastTime = 0, toastTimer = null;
let lang = 'ru';
// Перевод: ключ — русская строка (базовый язык), см. i18n.js
const tr = (key, params) => I18N.translate(lang, key, params);

function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v === undefined || v === null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'style') node.style.cssText = v;
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
        else if (typeof v === 'boolean' || k === 'value') node[k] = v;
        else node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : String(c));
    return node;
}

const colorOf = b => b.color || DEFAULT_COLOR[b.icon] || '';
const PART_LABELS = { equip: 'Экипировка', talents: 'Таланты', crests: 'Символы', polish: 'Улучшения' };
const partOn = (b, p) => !b.parts || b.parts[p] !== false;
function togglePart(b, p) { send('update', b.name, { parts: { [p]: !partOn(b, p) } }); }
const pageText = p => (p === null || p === undefined ? '?' : tr('стр. {n}', { n: p + 1 }));

// Кнопка с подтверждением вторым нажатием (если включено в настройках)
let confirmTimer = null;
function confirmButton(label, confirmLabel, cls, action) {
    const b = el('button', { class: `small ${cls || ''}` }, label);
    b.addEventListener('click', () => {
        if (!state.options.confirmDelete || b.classList.contains('confirm')) { clearTimeout(confirmTimer); action(); return; }
        b.classList.add('confirm');
        b.textContent = confirmLabel;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { b.classList.remove('confirm'); b.textContent = label; }, 2500);
    });
    return b;
}

// ---------------------------------------------------------------- основной вид
function chip(text, match, off, onClick) {
    let cls = 'chip', mark = '';
    if (off) cls += ' off';
    else if (match === true) { cls += ' ok'; mark = ' ✓'; } else if (match === false) { cls += ' bad'; mark = ' ✗'; }
    if (onClick) cls += ' toggle';
    return el(onClick ? 'button' : 'span', {
        class: cls,
        title: onClick ? (off ? tr('Не переключается. Нажмите, чтобы включить') : tr('Нажмите, чтобы не переключать это')) : '',
        on: onClick ? { click: onClick } : null
    }, text + mark);
}

function renderAlerts(s) {
    const box = $('alerts');
    box.textContent = '';
    const add = (text, bad) => box.append(el('div', { class: `alert${bad ? ' bad' : ''}` }, text));
    if (s.inCombat && s.options.blockInCombat) add(tr('В бою: переключение недоступно.'), true);
    if (s.openWindow) {
        const how = { single: tr('символы будут переставлены по одному (медленнее)'), skip: tr('символы не будут сменены'), abort: tr('сменить символы нельзя, закройте его') }[s.options.crestsWhenBusy];
        add(tr('Открыто окно взаимодействия (NPC, банк, торговля, крафт…): {how}.', { how }), s.options.crestsWhenBusy === 'abort');
    }
    if (s.hotkeyErrors && s.hotkeyErrors.length) add(tr('Не удалось занять клавиши: {list}. Их перехватила другая программа.', { list: s.hotkeyErrors.join(', ') }), true);
}

function renderMain(s) {
    $('char').textContent = s.character ? `· ${s.character}` : '';
    const active = s.builds.filter(b => b.active).map(b => b.name);
    const now = $('now-build');
    if (s.busy) { now.textContent = tr('Переключение…'); now.className = 'now-value'; }
    else if (active.length) { now.textContent = active.join(', '); now.className = 'now-value'; }
    else { now.textContent = s.character ? tr('Не совпадает ни с одним билдом') : tr('Нет персонажа'); now.className = 'now-value none'; }
    const c = s.current;
    $('now-detail').innerHTML = '';
    $('now-detail').append(
        el('div', {}, tr('Экипировка {equip} · Таланты {page}', { equip: c.equip === null || c.equip === undefined ? '?' : c.equip, page: pageText(c.epPreset) })),
        el('div', {}, tr('Символы {crests} · Улучшения {polish}', { crests: c.crests === null ? '?' : c.crests, polish: c.polish === null ? '?' : c.polish })));
    renderAlerts(s);

    const box = $('builds');
    box.textContent = '';
    if (!s.character) { box.append(el('div', { class: 'empty' }, tr('Зайдите на персонажа.'))); }
    else if (!s.builds.length) {
        box.append(el('div', { class: 'empty' }, tr('Билдов пока нет. Настройте в игре экипировку, символы, таланты и улучшения умений, впишите имя ниже (например, tank) и нажмите «Сохранить текущее».')));
    }
    for (const b of s.builds) {
        const blocked = s.busy || (s.inCombat && s.options.blockInCombat);
        box.append(el('div', { class: `card${b.active ? ' active' : ''}` },
            el('button', { class: 'big', title: tr('Включить «{name}»', { name: b.name }) + (b.hotkey ? ` (${b.hotkey})` : ''), disabled: blocked, style: colorOf(b) ? `color:${colorOf(b)}` : null, on: { click: () => send('apply', b.name) } }, iconEl(b.icon)),
            el('div', { class: 'card-body' },
                el('div', { class: 'card-head' },
                    el('span', { class: 'name' }, b.name),
                    b.active ? el('span', { class: 'tag tag-active' }, tr('включён')) : null,
                    b.hotkey ? el('span', { class: 'tag tag-key', title: tr('Горячая клавиша') }, b.hotkey) : null),
                el('div', { class: 'chips' },
                    b.equip !== null && b.equip !== undefined ? chip(tr('Экипировка {n}', { n: b.equip }), b.match.equip, !partOn(b, 'equip'), () => togglePart(b, 'equip')) : null,
                    b.epPreset !== null ? chip(tr('Таланты {page}', { page: pageText(b.epPreset) }), b.match.ep, !partOn(b, 'talents'), () => togglePart(b, 'talents')) : null,
                    b.crests !== null ? chip(tr('Символы {n}', { n: b.crests }), b.match.crests, !partOn(b, 'crests'), () => togglePart(b, 'crests')) : null,
                    b.polish !== null ? chip(tr('Улучшения {n}', { n: b.polish }), b.match.polish, !partOn(b, 'polish'), () => togglePart(b, 'polish'))  : null),
                b.missing.length ? el('div', { class: 'warn', title: tr('Один раз переключите это в игре вручную, и мод запомнит') }, tr('Нужно выучить: {list}', { list: b.missing.join(', ') })) : null),
            el('button', { class: 'win edit-btn', title: tr('Настроить билд'), on: { click: () => openEditor(b.name) } },
                el('span', { style: 'font-size:15px' }, '✎'))
        ));
    }
    $('btn-save').disabled = !s.character;
}

// ---------------------------------------------------------------- редактор билда
function openEditor(name) {
    editing = name;
    const b = state && state.builds.find(x => x.name === name);
    if (b && ICONS[b.icon]) iconTab = ICONS[b.icon].custom ? CUSTOM_TAB : ICONS[b.icon].group;
    renderEditor();
}
function closeEditor() {
    const input = $('ed-name');
    if (editing && input.value.trim() && input.value.trim() !== editing) send('rename', editing, input.value.trim());
    editing = null;
    $('editor').classList.add('hidden');
}

function renderEditor() {
    const sheet = $('editor');
    const b = editing && state && state.builds.find(x => x.name === editing);
    if (!b) { editing = null; sheet.classList.add('hidden'); return; }
    sheet.classList.remove('hidden');

    const prev = $('ed-preview');
    prev.textContent = '';
    prev.style.color = colorOf(b);
    prev.append(iconEl(b.icon));
    if (document.activeElement !== $('ed-name')) $('ed-name').value = b.name;

    const tabs = $('ed-tabs');
    tabs.textContent = '';
    const customIds = Object.keys(state.customIcons || {}).filter(id => ICONS[id]);
    for (const name of ICON_GROUPS.map(g => g.name).concat(CUSTOM_TAB)) {
        const label = name === CUSTOM_TAB && customIds.length ? `${tr(name)} (${customIds.length})` : tr(name);
        tabs.append(el('button', { class: name === iconTab ? 'on' : '', on: { click: () => { iconTab = name; renderEditor(); } } }, label));
    }

    const grid = $('ed-icons');
    grid.textContent = '';
    const ids = iconTab === CUSTOM_TAB ? customIds : Object.keys((ICON_GROUPS.find(g => g.name === iconTab) || ICON_GROUPS[0]).icons);
    for (const id of ids) {
        grid.append(el('button', { class: id === b.icon ? 'on' : '', title: tr(ICONS[id].name), on: { click: () => send('update', b.name, { icon: id }) } }, iconEl(id)));
    }
    if (iconTab === CUSTOM_TAB) {
        grid.append(el('button', { class: 'upload-tile', title: tr('Загрузить SVG-файлы'), on: { click: () => $('svg-file').click() } }, '+'));
    }
    renderCustomTools(b);

    const sw = $('ed-colors');
    sw.textContent = '';
    for (const c of ICON_COLORS) {
        sw.append(el('button', {
            class: `swatch${c ? '' : ' auto'}${(b.color || '') === c ? ' on' : ''}`,
            title: c ? c : tr('Авто (по иконке)'),
            style: c ? `background:${c}` : null,
            on: { click: () => send('update', b.name, { color: c }) }
        }));
    }

    const hk = $('ed-hotkey');
    if (!hk.classList.contains('listening')) hk.value = b.hotkey || '';
    hk.disabled = !state.hotkeysAvailable;
    $('ed-hotkey-hint').textContent = !state.hotkeysAvailable
        ? tr('Горячие клавиши работают только в TeraToolbox.exe (с интерфейсом).')
        : (!state.options.hotkeysEnabled ? tr('Горячие клавиши выключены в настройках.') : tr('Работает и когда окно свёрнуто. Сочетание перехватывается у всех программ, включая игру, поэтому выбирайте свободное: например, Ctrl+Alt+1 или F9.'));
    renderParts(b);

    const actions = $('ed-overwrite').parentNode;
    const oldOw = $('ed-overwrite'), oldDel = $('ed-delete');
    const ow = confirmButton(tr('Перезаписать текущим'), tr('Точно перезаписать?'), '', () => send('save', b.name));
    ow.id = 'ed-overwrite';
    const del = confirmButton(tr('Удалить'), tr('Удалить?'), 'danger', () => { send('delete', b.name); editing = null; sheet.classList.add('hidden'); });
    del.id = 'ed-delete';
    actions.replaceChild(ow, oldOw);
    actions.replaceChild(del, oldDel);
}

// Панель под сеткой на вкладке «Свои»: перекраска и удаление выбранной иконки
function renderCustomTools(b) {
    const box = $('ed-custom');
    box.textContent = '';
    box.classList.toggle('hidden', iconTab !== CUSTOM_TAB);
    if (iconTab !== CUSTOM_TAB) return;
    const icon = ICONS[b.icon] && ICONS[b.icon].custom ? (state.customIcons || {})[b.icon] : null;
    if (icon) {
        const tint = el('input', { type: 'checkbox', checked: !!icon.tint, on: { change: e => send('iconTint', b.icon, e.target.checked) } });
        box.append(el('div', { class: 'custom-row' },
            el('span', { class: 'custom-name', title: icon.name }, icon.name),
            el('label', { class: 'check', title: tr('Залить иконку цветом билда. Выключите для многоцветных иконок.') }, tint, tr('Цвет билда')),
            confirmButton(tr('Удалить иконку'), tr('Удалить?'), 'danger', () => send('deleteIcon', b.icon))));
    }
    box.append(el('p', { class: 'hint' }, tr('Нажмите «+» или перетащите сюда .svg файлы (до 150 КБ). Скрипты, внешние ссылки и встроенные картинки из файла удаляются. Одноцветные иконки сразу красятся в цвет билда.')));
}

async function uploadSvgFiles(files) {
    const list = Array.from(files || []).filter(f => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
    if (!list.length) { showLocalToast(tr('Выберите файлы .svg'), 'error'); return; }
    for (const f of list) {
        try {
            if (f.size > 1024 * 1024) throw new Error(tr('Файл больше 1 МБ.'));
            const clean = sanitizeSvg(await f.text());
            send('addIcon', f.name, clean.svg, clean.colors <= 1, list.length === 1 ? editing : null);
        } catch (e) {
            showLocalToast(`${f.name}: ${tr(e.message)}`, 'error');
        }
    }
    iconTab = CUSTOM_TAB;
}

function showLocalToast(text, level) {
    const t = $('toast');
    t.textContent = text;
    t.className = `toast ${level || 'ok'}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 8000);
}

$('svg-file').addEventListener('change', e => { uploadSvgFiles(e.target.files); e.target.value = ''; });
const sheetBody = document.querySelector('#editor .sheet-body');
sheetBody.addEventListener('dragover', e => { e.preventDefault(); sheetBody.classList.add('drop'); });
sheetBody.addEventListener('dragleave', e => { if (e.target === sheetBody) sheetBody.classList.remove('drop'); });
sheetBody.addEventListener('drop', e => { e.preventDefault(); sheetBody.classList.remove('drop'); uploadSvgFiles(e.dataTransfer.files); });
// Не даём окну «открыть» перетащенный файл вместо загрузки
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

$('ed-close').addEventListener('click', closeEditor);
$('editor').addEventListener('click', e => { if (e.target === $('editor')) closeEditor(); });
$('ed-name').addEventListener('keydown', e => { if (e.key === 'Enter') closeEditor(); if (e.key === 'Escape') { $('ed-name').value = editing; closeEditor(); } });
let equipListOpen = false;
function renderParts(b) {
    const box = $('ed-parts');
    box.textContent = '';
    const info = {
        equip: b.equip ? tr('{n} предм.', { n: b.equip }) : tr('не сохранена'),
        talents: b.epPreset !== null ? pageText(b.epPreset) : tr('не сохранены'),
        crests: b.crests !== null ? tr('{n} шт.', { n: b.crests }) : tr('не сохранены'),
        polish: b.polish !== null ? tr('{n} опц.', { n: b.polish }) : tr('не сохранены')
    };
    const matchKey = { equip: 'equip', talents: 'ep', crests: 'crests', polish: 'polish' };
    for (const p of ['equip', 'talents', 'crests', 'polish']) {
        const input = el('input', { type: 'checkbox', checked: partOn(b, p), on: { change: () => togglePart(b, p) } });
        const m = b.match[matchKey[p]];
        const row = el('div', { class: 'part-row' },
            el('label', { class: 'switch' }, input, el('i')),
            el('span', { class: 'part-name' }, tr(PART_LABELS[p])),
            el('span', { class: `part-info${m === true ? ' ok' : m === false ? ' bad' : ''}` }, info[p] + (m === true ? ' ✓' : m === false ? ' ✗' : '')));
        if (p === 'equip' && b.equipList && b.equipList.length) {
            row.append(el('button', { class: 'link', on: { click: () => { equipListOpen = !equipListOpen; renderParts(b); } } }, equipListOpen ? tr('скрыть') : tr('список')));
        }
        box.append(row);
        if (p === 'equip' && equipListOpen && b.equipList) {
            box.append(el('div', { class: 'equip-list' }, b.equipList.map(it =>
                el('div', { class: `equip-item${it.equipped ? ' on' : ''}`, title: it.equipped ? tr('Надет сейчас') : tr('Сейчас не надет') },
                    el('span', { class: 'slot' }, it.slotName), el('span', { class: 'iname' }, it.name), el('span', { class: 'mark' }, it.equipped ? '✓' : '')))));
        }
    }
    box.append(el('p', { class: 'hint' }, tr('Выключенное мод не трогает при переключении: например, только таланты и улучшения, а экипировку и символы вы меняете сами. Плашки на карточке билда тоже переключаются нажатием.')));
}
$('ed-up').addEventListener('click', () => editing && send('move', editing, -1));
$('ed-down').addEventListener('click', () => editing && send('move', editing, 1));
$('ed-hotkey-clear').addEventListener('click', () => editing && send('update', editing, { hotkey: '' }));

// Захват сочетания клавиш в формате Electron Accelerator
const KEYMAP = {
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: '\'',
    Comma: ',', Period: '.', Slash: '/', Space: 'Space', Tab: 'Tab', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
    Pause: 'Pause', ScrollLock: 'Scrolllock', PrintScreen: 'PrintScreen'
};
function keyName(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^F(\d{1,2})$/.exec(code))) return `F${m[1]}`;
    if ((m = /^Numpad(\d)$/.exec(code))) return `num${m[1]}`;
    return KEYMAP[code] || null;
}
const hk = $('ed-hotkey');
hk.addEventListener('focus', () => { hk.classList.add('listening'); hk.value = tr('Нажмите сочетание… (Esc — отмена)'); });
hk.addEventListener('blur', () => { hk.classList.remove('listening'); renderEditor(); });
hk.addEventListener('keydown', e => {
    e.preventDefault();
    if (e.code === 'Escape') { hk.blur(); return; }
    if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
    const key = keyName(e.code);
    if (!key) { hk.value = tr('Эта клавиша не поддерживается'); return; }
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Super');
    // Без модификатора разрешаем только F-клавиши и цифровой блок, иначе сломаем набор текста в игре
    if (!mods.length && !/^(F\d+|num.+)$/.test(key)) { hk.value = tr('Добавьте Ctrl, Alt или Shift (или F-клавишу)'); return; }
    hk.classList.remove('listening');
    send('update', editing, { hotkey: mods.concat(key).join('+') });
    hk.blur();
});

// ---------------------------------------------------------------- настройки
const THEMES = { tera: '#4fb3ff', graphite: '#7aa7ff', crimson: '#ff6b81', emerald: '#4fd6a0', light: '#eef2f7' };
const THEME_NAMES = { tera: 'TERA', graphite: 'Графит', crimson: 'Багровая', emerald: 'Изумруд', light: 'Светлая' };

function optValue(key) { return state.options[key.replace(/^gui\./, '')]; }
function setOpt(key, value) { send('setting', key, value); }

// Строим элементы управления один раз, затем только обновляем значения
function buildSettings() {
    for (const row of document.querySelectorAll('#view-settings .row[data-key]')) {
        const { key, type } = row.dataset;
        if (row.ctl) { row.ctl.remove(); row.ctl = null; }
        let ctl;
        if (type === 'lang') {
            const sel = el('select', { on: { change: e => setOpt(key, e.target.value) } },
                Object.entries(I18N.LANGUAGES).map(([v, label]) => el('option', { value: v }, label)));
            ctl = el('div', { class: 'ctl' }, sel);
            row.update = v => { sel.value = v || 'ru'; };
            row.ctl = ctl;
            row.append(ctl);
            continue;
        }
        if (type === 'bool') {
            const input = el('input', { type: 'checkbox', on: { change: e => setOpt(key, e.target.checked) } });
            ctl = el('label', { class: 'switch' }, input, el('i'));
            row.update = v => { input.checked = !!v; };
        } else if (type === 'range') {
            const out = el('output');
            const fmt = v => (Number(v) === 0 && row.dataset.zero ? tr(row.dataset.zero) : `${v}${tr(row.dataset.unit || '')}`);
            let t = null;
            const input = el('input', {
                type: 'range', min: row.dataset.min, max: row.dataset.max, step: row.dataset.step,
                on: {
                    input: e => { out.textContent = fmt(e.target.value); clearTimeout(t); t = setTimeout(() => setOpt(key, Number(e.target.value)), 60); },
                    change: e => setOpt(key, Number(e.target.value))
                }
            });
            ctl = el('div', { class: 'ctl' }, input, out);
            row.update = v => { if (document.activeElement !== input) input.value = v; out.textContent = fmt(input.value); };
        } else if (type === 'seg') {
            const opts = row.dataset.options.split('|').map(x => x.split(':'));
            const btns = opts.map(([v, label]) => el('button', { on: { click: () => setOpt(key, v) } }, tr(label)));
            ctl = el('div', { class: 'seg' }, btns);
            row.update = v => btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === v));
        } else if (type === 'select') {
            const opts = row.dataset.options.split('|').map(x => x.split(':'));
            const sel = el('select', { on: { change: e => setOpt(key, e.target.value) } }, opts.map(([v, label]) => el('option', { value: v }, tr(label))));
            ctl = el('div', { class: 'ctl' }, sel);
            row.update = v => { sel.value = v; };
        } else if (type === 'theme') {
            const dots = Object.keys(THEMES).map(t => el('button', { class: 'theme-dot', title: tr(THEME_NAMES[t]), style: `background:${THEMES[t]}`, on: { click: () => setOpt(key, t) } }));
            ctl = el('div', { class: 'themes' }, dots);
            row.update = v => dots.forEach((d, i) => d.classList.toggle('on', Object.keys(THEMES)[i] === v));
        }
        row.ctl = ctl;
        row.append(ctl);
    }
}

function renderSettings(s) {
    for (const row of document.querySelectorAll('#view-settings .row[data-key]')) if (row.update) row.update(optValue(row.dataset.key));
    const l = s.learned || {};
    $('learned-info').textContent = tr('страниц талантов: {ep}{ept}, опций улучшения: {polish}{pt}', { ep: l.epPages || 0, ept: l.epTemplate ? tr(' (+шаблон)') : '', polish: l.polish || 0, pt: l.polishTemplate ? tr(' (+шаблон)') : '' });
    $('version').textContent = s.version ? `build-switcher ${s.version}` : '';
    const hkRow = document.querySelector('.row[data-key="hotkeysEnabled"]');
    if (hkRow) hkRow.classList.toggle('hidden', !s.hotkeysAvailable);
}

$('btn-forget').replaceWith((() => {
    const b = confirmButton(tr('Забыть'), tr('Точно?'), 'danger', () => send('forget'));
    b.id = 'btn-forget';
    return b;
})());
$('btn-reset-window').addEventListener('click', () => send('resetWindow'));
$('btn-back').addEventListener('click', () => setView('main'));
$('btn-settings').addEventListener('click', () => setView(view === 'settings' ? 'main' : 'settings'));

function setView(v) {
    view = v;
    if (state) render(state);
}

// ---------------------------------------------------------------- компактный режим
function renderCompact(s) {
    const box = $('view-compact');
    box.textContent = '';
    box.classList.toggle('column', s.options.layout === 'column');
    box.classList.toggle('no-bg', !s.options.buttonBg);
    box.style.setProperty('--isz', `${s.options.iconSize}px`);
    if (!s.builds.length) {
        box.append(el('div', { class: 'compact-empty' }, s.character ? tr('Нет билдов') : tr('Зайдите в игру')));
    }
    const blocked = s.busy || (s.inCombat && s.options.blockInCombat);
    for (const b of s.builds) {
        box.append(el('button', {
            class: `cbtn${b.active ? ' active' : ''}`,
            title: tr('Включить «{name}»', { name: b.name }) + (b.hotkey ? ` (${b.hotkey})` : '') + (s.inCombat && s.options.blockInCombat ? tr(' — недоступно в бою') : ''),
            on: { click: () => !blocked && send('apply', b.name) }
        },
        el('div', { class: 'big', style: colorOf(b) ? `color:${colorOf(b)}` : null }, iconEl(b.icon)),
        s.options.labels ? el('span', {}, b.name) : null));
    }
    requestAnimationFrame(fitCompact);
}

// Подгоняем окно под кнопки — без полос прокрутки
function fitCompact() {
    if (!state || !state.options.compact) return;
    const box = $('view-compact').getBoundingClientRect();
    const bar = document.body.classList.contains('show-bar') ? $('titlebar').getBoundingClientRect().height : 0;
    const z = (state.options.zoom || 100) / 100;
    send('fit', Math.max(box.width, 96) * z, (box.height + bar) * z);
}

$('c-expand').addEventListener('click', () => setOpt('gui.compact', false));
$('c-close').addEventListener('click', () => send('close'));

// ---------------------------------------------------------------- уведомление
function renderToast(s) {
    const t = $('toast');
    const r = s.report;
    if (!r || r.time === lastToastTime) return;
    lastToastTime = r.time;
    if (s.options.compact) return; // в компактном режиме места нет — результат виден по подсветке кнопки
    t.textContent = r.text;
    t.className = `toast ${r.level || 'ok'}`;
    clearTimeout(toastTimer);
    const sec = s.options.toastSeconds;
    const lvl = r.level || 'ok';
    if (sec > 0) toastTimer = setTimeout(() => t.classList.add('hidden'), (lvl === 'ok' ? sec : sec * 2) * 1000);
}
$('toast').addEventListener('click', () => $('toast').classList.add('hidden'));

// ---------------------------------------------------------------- общий рендер
function render(s) {
    state = s;
    const o = s.options;
    installCustomIcons(s.customIcons);
    document.body.classList.toggle('transparent', !!(o.compact && o.transparentBg));
    document.body.dataset.theme = o.theme || 'tera';
    document.body.classList.toggle('busy', s.busy);
    document.body.classList.toggle('compact', o.compact);
    document.body.classList.toggle('show-bar', o.compact && !o.autoHideBar);
    if (webFrame) webFrame.setZoomFactor((o.zoom || 100) / 100);
    $('btn-pin').classList.toggle('on', o.alwaysOnTop);
    $('btn-settings').classList.toggle('on', view === 'settings');

    const compact = o.compact;
    $('view-main').classList.toggle('hidden', compact || view !== 'main');
    $('view-settings').classList.toggle('hidden', compact || view !== 'settings');
    $('view-compact').classList.toggle('hidden', !compact);
    if (compact) { $('editor').classList.add('hidden'); renderCompact(s); }
    else if (view === 'settings') renderSettings(s);
    else { renderMain(s); if (editing) renderEditor(); }
    renderToast(s);
}

// ---------------------------------------------------------------- язык: статичный текст из index.html
// Запоминаем исходные (русские) тексты, подсказки и плейсхолдеры, при смене языка подставляем перевод.
const DYNAMIC_IDS = ['builds', 'alerts', 'now-build', 'now-detail', 'view-compact', 'ed-tabs', 'ed-icons', 'ed-custom', 'ed-colors',
    'ed-parts', 'toast', 'char', 'learned-info', 'version', 'ed-hotkey-hint', 'ed-preview'];
const staticTexts = [], staticAttrs = [];
function collectStatic() {
    const dynamic = DYNAMIC_IDS.map(id => $(id)).filter(Boolean);
    const inDynamic = n => dynamic.some(d => d === n || d.contains(n));
    for (const node of document.querySelectorAll('body *')) {
        if (node.closest('svg') || node.tagName === 'SCRIPT' || inDynamic(node)) continue;
        for (const child of node.childNodes) {
            if (child.nodeType !== 3 || !child.nodeValue.trim()) continue;
            const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(child.nodeValue);
            staticTexts.push({ node: child, lead: m[1], key: m[2], trail: m[3] });
        }
        for (const attr of ['title', 'placeholder']) {
            const v = node.getAttribute(attr);
            if (v) staticAttrs.push({ node, attr, key: v });
        }
    }
}
function applyStatic() {
    for (const t of staticTexts) t.node.nodeValue = t.lead + tr(t.key) + t.trail;
    for (const a of staticAttrs) a.node.setAttribute(a.attr, tr(a.key));
    document.documentElement.lang = lang;
}
collectStatic();

function setLanguage(next) {
    if (!I18N.LANGUAGES[next] || next === lang) return;
    lang = next;
    applyStatic();
    buildSettings();
}

handlers.state = s => { setLanguage((s.options && s.options.language) || 'ru'); render(s); };

// ---------------------------------------------------------------- заголовок и прочее
$('btn-close').addEventListener('click', () => send('close'));
$('btn-min').addEventListener('click', () => send('minimize'));
$('btn-pin').addEventListener('click', () => state && setOpt('gui.alwaysOnTop', !state.options.alwaysOnTop));
$('btn-compact').addEventListener('click', () => state && setOpt('gui.compact', !state.options.compact));

function saveNew() {
    const name = $('new-name').value.trim();
    if (!name) { $('new-name').focus(); return; }
    send('save', name);
    $('new-name').value = '';
}
$('btn-save').addEventListener('click', saveNew);
$('new-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveNew(); });

// Прозрачность «в покое»: сообщаем, наведён ли курсор
document.documentElement.addEventListener('mouseenter', () => send('hover', true));
document.documentElement.addEventListener('mouseleave', () => send('hover', false));

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && editing && document.activeElement !== hk) closeEditor();
});

buildSettings();
send('ready');
