'use strict';

/* Общий код окон мода: связь с модом, перевод, построение элементов, тема и масштаб. */
/* global I18N, DEFAULT_COLOR */

// ---------------------------------------------------------------- связь с модом (свой канал, см. lib/gui.js)
const CHANNEL = 'build-switcher';
let ipc = null, webFrame = null;
try { const e = require('electron'); ipc = e.ipcRenderer; webFrame = e.webFrame; } catch (_) { /* предпросмотр в браузере */ }

const handlers = {};
function send(name, ...args) { if (ipc) ipc.send(CHANNEL, name, ...args); else if (window.__preview) window.__preview(name, ...args); }
if (ipc) ipc.on(CHANNEL, (event, name, ...args) => { if (handlers[name]) handlers[name](...args); });

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- перевод
let lang = 'ru';
// Ключ перевода — русская строка (базовый язык), см. i18n.js
const tr = (key, params) => I18N.translate(lang, key, params);

// Статичный текст страницы: запоминаем исходные (русские) тексты, подсказки и плейсхолдеры,
// при смене языка подставляем перевод. Элементы из dynamicIds заполняет код — их пропускаем.
const staticTexts = [], staticAttrs = [];
function collectStatic(dynamicIds) {
    const dynamic = dynamicIds.map(id => $(id)).filter(Boolean);
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
// Возвращает true, если язык сменился
function setLanguage(next) {
    if (!I18N.LANGUAGES[next] || next === lang) return false;
    lang = next;
    applyStatic();
    return true;
}

// ---------------------------------------------------------------- элементы
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

// ---------------------------------------------------------------- тема, масштаб, наведение
function applyLook(o) {
    document.body.dataset.theme = o.theme || 'tera';
    if (webFrame) webFrame.setZoomFactor((o.zoom || 100) / 100);
}
document.documentElement.addEventListener('mouseenter', () => send('hover', true));
document.documentElement.addEventListener('mouseleave', () => send('hover', false));
// Не даём окну «открыть» перетащенный файл
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

// ---------------------------------------------------------------- кнопки панели (панель и предпросмотр в настройках)
const hexRgb = h => {
    const m = /^#([0-9a-f]{6})$/i.exec(h || '');
    return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).join(',') : null;
};
// Внешний вид кнопок задаётся CSS-переменными на контейнере .bar
function applyBarLook(box, o) {
    const set = (k, v) => (v === null || v === undefined || v === '' ? box.style.removeProperty(k) : box.style.setProperty(k, v));
    box.classList.toggle('column', o.layout === 'column');
    box.classList.toggle('no-bg', o.buttonBg === false);
    box.classList.toggle('no-border', o.buttonBorder === false);
    set('--isz', `${o.iconSize || 56}px`);
    const rgb = hexRgb(o.buttonBgColor) || getComputedStyle(document.body).getPropertyValue('--tile-theme-rgb').trim();
    const a = (o.buttonBgOpacity === undefined ? 100 : o.buttonBgOpacity) / 100;
    set('--tile-rgb', rgb);
    set('--tile-a', String(a));
    set('--tile-a2', String(Math.min(1, a * 0.75)));
    set('--act-rgb', hexRgb(o.activeBgColor) || rgb);
    set('--bd', o.borderColor || '');
    set('--act-bd', o.activeBorderColor || '');
    set('--act-bd-rgb', hexRgb(o.activeBorderColor) || '');
    set('--bdw', `${o.borderWidth || 1}px`);
    set('--rad', `${o.radius === undefined ? 10 : o.radius}px`);
    const pad = o.iconPadding === undefined ? -1 : o.iconPadding;
    box.classList.toggle('pad', pad >= 0);
    set('--ipad', pad >= 0 ? `${pad}px` : '');
}
function barButton(b, o, { blocked = false, title = '', onClick = null } = {}) {
    const color = b.active && o.activeIconColor ? o.activeIconColor : (o.iconColor || colorOf(b));
    return el('button', {
        class: `cbtn${b.active ? ' active' : ''}${blocked ? ' blocked' : ''}${b.unsaved ? ' unsaved' : ''}`,
        title: title || null,
        on: onClick ? { click: onClick } : null
    },
    el('div', { class: 'big', style: color ? `color:${color}` : null }, iconEl(b.icon)),
    o.labels ? el('span', {}, b.name) : null);
}

// ---------------------------------------------------------------- ошибки страницы — в лог мода
window.addEventListener('error', e => send('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', e => send('error', String(e.reason)));
