'use strict';

// Библиотека иконок (24×24, контур + лёгкая заливка). F = заливка основной формы.
const F = 'fill="currentColor" fill-opacity=".2"';
const T = d => `<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="currentColor" stroke="none">${d}</text>`;

const ICON_GROUPS = [
    {
        name: 'Роли', icons: {
            shield: ['Щит', `<path ${F} d="M12 2.5l7.5 2.8v5.9c0 4.9-3.2 9-7.5 10.3-4.3-1.3-7.5-5.4-7.5-10.3V5.3z"/><path d="M12 7v10M8 11h8"/>`],
            aegis: ['Эгида', `<path ${F} d="M12 2.5l7.5 2.8v5.9c0 4.9-3.2 9-7.5 10.3-4.3-1.3-7.5-5.4-7.5-10.3V5.3z"/><circle cx="12" cy="11.5" r="3"/>`],
            sword: ['Меч', `<path ${F} d="M20.5 3.5l-.8 4.2-9 9-3.4-3.4 9-9z"/><path d="M5 12.5l6.5 6.5M8 16l-4 4"/>`],
            swords: ['Мечи', `<path d="M4 4l11 11M13.5 17.5l4-4M16.5 16.5L20 20M20 4L9 15M6.5 13.5l4 4M7.5 16.5L4 20"/>`],
            fist: ['Кулак', `<path ${F} d="M6 11V8a1.5 1.5 0 0 1 3 0v-.5a1.5 1.5 0 0 1 3 0V8a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v4.5c0 4-2.7 7-6.2 7H11c-3 0-5-2.2-5-5z"/><path d="M9 8v3.5M12 8v3.5M15 9v3M6 12.5h4.5a1.5 1.5 0 0 1 0 3H9"/>`],
            heal: ['Лечение', `<path ${F} d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>`],
            heart: ['Сердце', `<path ${F} d="M12 20s-8-4.7-8-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.3C20 15.3 12 20 12 20z"/>`],
            helmet: ['Шлем', `<path ${F} d="M4 16a8 8 0 0 1 16 0v3h-6v-4h-4v4H4z"/><path d="M12 5v5"/>`],
            crown: ['Корона', `<path ${F} d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/><path d="M5 21h14"/>`],
            star: ['Звезда', `<path ${F} d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>`],
            skull: ['Череп', `<path ${F} d="M12 3a7 7 0 0 0-7 7c0 2.6 1.3 4.4 3 5.4V19h8v-3.6c1.7-1 3-2.8 3-5.4a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="11" r="1.4" fill="currentColor"/><circle cx="14.7" cy="11" r="1.4" fill="currentColor"/><path d="M10.5 19v2M13.5 19v2"/>`],
            target: ['Цель', `<circle ${F} cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`]
        }
    },
    {
        name: 'Оружие', icons: {
            axe: ['Топор', `<path d="M5 20L15.5 6"/><path ${F} d="M13 4.5c2.8-1.3 6.3-.4 7.6 2.3.8 1.7.2 3.5-1 4.4-1.6-2.4-4-4-6.6-4.3z"/>`],
            hammer: ['Молот', `<path ${F} d="M4 4.5h11v6H4z"/><path d="M9.5 10.5V21M15 6h2.5a2 2 0 0 1 2 2"/>`],
            lance: ['Копьё', `<path d="M4 20L15 9"/><path ${F} d="M20.5 3.5l-1.8 6.3-3.5-3.5z"/><path d="M11.5 10.5l2 2"/>`],
            bow: ['Лук', `<path ${F} d="M6 3c8.5 3 8.5 15 0 18z"/><path d="M3 12h16M16.5 9l3 3-3 3"/>`],
            staff: ['Посох', `<path d="M5 21l9.5-12.5"/><circle ${F} cx="17" cy="6" r="3.2"/><path d="M17 1.5v1.3M21.5 6h-1.3M20.2 2.8l-.9.9"/>`],
            dagger: ['Кинжал', `<path ${F} d="M20 4l-1.5 5.2-5.8 5.8-3.7-3.7L14.8 5.5z"/><path d="M7 9.8l7.2 7.2M9.3 15L5 19.3"/>`],
            scythe: ['Коса', `<path d="M7 21L15 4"/><path ${F} d="M15 4C10.5 1.8 5 3 2.5 6.5 6.5 5.5 10.8 6 14 8.5z"/>`],
            gun: ['Пушка', `<path ${F} d="M3 8h14l3 2v3h-8.5l-1 2.5V19H7v-4.5L6 13H3z"/><path d="M11 13v-2.5M20 8V6"/>`],
            chakram: ['Диск', `<circle ${F} cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5V4M12 20v2.5M1.5 12H4M20 12h2.5"/>`],
            fan: ['Кулон', `<path ${F} d="M12 3l7 9-7 9-7-9z"/><path d="M12 7v10M8.5 12h7"/>`]
        }
    },
    {
        name: 'Стихии', icons: {
            flame: ['Пламя', `<path ${F} d="M12 2.5c1 3.6 5.5 5.7 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.6 1.5-4.3 2.6-5.2.3 1.9 1.2 2.9 2.3 3.4C10.8 8.6 10.6 5.6 12 2.5z"/>`],
            bolt: ['Молния', `<path ${F} d="M13.5 2L4.5 13.5h6.5L10 22l9-11.5h-6.5z"/>`],
            snow: ['Лёд', `<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>`],
            drop: ['Вода', `<path ${F} d="M12 3s6.5 6.6 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z"/>`],
            leaf: ['Лист', `<path ${F} d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19l9-9"/>`],
            moon: ['Луна', `<path ${F} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>`],
            sun: ['Солнце', `<circle ${F} cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>`],
            wind: ['Ветер', `<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>`]
        }
    },
    {
        name: 'Разное', icons: {
            eye: ['Глаз', `<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle ${F} cx="12" cy="12" r="3"/>`],
            flag: ['Флаг', `<path ${F} d="M5 4h12l-2.5 4L17 12H5z"/><path d="M5 21V3"/>`],
            gem: ['Кристалл', `<path ${F} d="M6.5 3h11l4 6L12 21 2.5 9z"/><path d="M2.5 9h19M8 9l4 12 4-12M9.5 3L8 9M14.5 3L16 9"/>`],
            potion: ['Зелье', `<path ${F} d="M10 2.5v6l-5 8.5a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-8.5v-6"/><path d="M8.5 2.5h7M7 15h10"/>`],
            wings: ['Крылья', `<path ${F} d="M11 9C8 5 4 4 2 6c1.7.8 2.8 2.3 3 4-1 .2-2 .8-2.5 1.8 2.8 0 5 .8 6.5 3 1.3-1.5 2-3.6 2-5.8zM13 9c3-4 7-5 9-3-1.7.8-2.8 2.3-3 4 1 .2 2 .8 2.5 1.8-2.8 0-5 .8-6.5 3-1.3-1.5-2-3.6-2-5.8z"/>`],
            castle: ['Данж', `<path ${F} d="M4 21V9h2.5V6H9v3h2V6h2v3h2V6h2.5v3H20v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>`],
            trophy: ['Кубок', `<path ${F} d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4a3 3 0 0 0 3.2 4.3M17 5.5h3a3 3 0 0 1-3.2 4.3M12 13.5v4M8 21h8M9 17.5h6"/>`],
            book: ['Книга', `<path ${F} d="M3 4.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H3zM21 4.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H21z"/>`],
            paw: ['Лапа', `<path ${F} d="M12 12c-3 0-5.5 3-5.5 5.3 0 1.8 1.3 2.7 2.8 2.7 1.1 0 1.7-.6 2.7-.6s1.6.6 2.7.6c1.5 0 2.8-.9 2.8-2.7C17.5 15 15 12 12 12z"/><circle cx="6" cy="10" r="1.8"/><circle cx="9.5" cy="6" r="1.8"/><circle cx="14.5" cy="6" r="1.8"/><circle cx="18" cy="10" r="1.8"/>`],
            clock: ['Часы', `<circle ${F} cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`],
            n1: ['1', `<rect ${F} x="3" y="3" width="18" height="18" rx="4"/>${T(1)}`],
            n2: ['2', `<rect ${F} x="3" y="3" width="18" height="18" rx="4"/>${T(2)}`],
            n3: ['3', `<rect ${F} x="3" y="3" width="18" height="18" rx="4"/>${T(3)}`],
            n4: ['4', `<rect ${F} x="3" y="3" width="18" height="18" rx="4"/>${T(4)}`],
            n5: ['5', `<rect ${F} x="3" y="3" width="18" height="18" rx="4"/>${T(5)}`]
        }
    }
];

const ICON_COLORS = ['', '#5aa9ff', '#4fd6e0', '#6fe0a0', '#c8e05a', '#e0b44c', '#ff8a4c', '#ff6b6b', '#ff8ad8', '#b78cff', '#dce6f5'];
const DEFAULT_COLOR = { shield: '#5aa9ff', aegis: '#5aa9ff', helmet: '#5aa9ff', sword: '#ff8a4c', swords: '#ff8a4c', fist: '#ff8a4c', axe: '#ff8a4c', heal: '#6fe0a0', heart: '#ff8ad8', leaf: '#6fe0a0' };

const ICONS = {};
for (const g of ICON_GROUPS) for (const [id, [name, svg]] of Object.entries(g.icons)) ICONS[id] = { name, svg, group: g.name };

// Вставляем <symbol> в документ один раз
function installIcons() {
    const NS = 'http://www.w3.org/2000/svg';
    const sprite = document.createElementNS(NS, 'svg');
    sprite.setAttribute('width', '0');
    sprite.setAttribute('height', '0');
    sprite.style.position = 'absolute';
    sprite.innerHTML = Object.entries(ICONS).map(([id, i]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${i.svg}</symbol>`).join('');
    document.body.prepend(sprite);
}

// ---------------------------------------------------------------- свои SVG
// Белый список элементов и атрибутов. Всё остальное (скрипты, обработчики событий, внешние ссылки,
// встроенные картинки, анимации) выбрасывается: окно мода имеет доступ к Node.js.
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
    'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'use', 'text', 'tspan', 'title']);
const SVG_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'width', 'height', 'points',
    'transform', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'id', 'offset', 'stop-color',
    'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'fx', 'fy', 'fr', 'clip-path', 'clippathunits', 'mask',
    'maskunits', 'viewbox', 'preserveaspectratio', 'href', 'xlink:href', 'font-size', 'font-weight', 'font-family', 'text-anchor',
    'dominant-baseline', 'letter-spacing', 'style', 'display', 'visibility', 'vector-effect', 'paint-order']);
const STYLE_PROPS = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-opacity', 'stroke-dasharray', 'stroke-miterlimit', 'opacity', 'stop-color', 'stop-opacity', 'clip-rule', 'display',
    'font-size', 'font-weight', 'font-family', 'text-anchor']);
const MAX_SVG_BYTES = 150 * 1024;

// Значение атрибута безопасно? Ссылки — только внутренние (#id).
function safeValue(name, v) {
    if (/javascript:|data:|expression\(|@import|<|>/i.test(v)) return false;
    if ((name === 'href' || name === 'xlink:href') && !/^#[\w-]+$/.test(v)) return false;
    if (/url\(/i.test(v) && !/^\s*url\(\s*['"]?#[\w-]+['"]?\s*\)\s*$/i.test(v)) return false;
    return true;
}

function cleanStyle(style) {
    return style.split(';').map(x => x.trim()).filter(Boolean).map(decl => {
        const i = decl.indexOf(':');
        if (i < 0) return null;
        const prop = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1).trim();
        return STYLE_PROPS.has(prop) && safeValue(prop, val) ? `${prop}:${val}` : null;
    }).filter(Boolean).join(';');
}

// Разбирает и чистит SVG. Возвращает { svg, viewBox, colors } или кидает ошибку с понятным текстом.
function sanitizeSvg(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Пустой файл.');
    if (text.length > MAX_SVG_BYTES) throw new Error('Файл больше 150 КБ — упростите иконку.');
    const doc = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/i, ''), 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('Это не SVG-файл или он повреждён.');

    let viewBox = root.getAttribute('viewBox');
    if (!viewBox) {
        const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
        viewBox = w > 0 && h > 0 ? `0 0 ${w} ${h}` : '0 0 24 24';
    }
    if (!/^[\d.\s,eE+-]+$/.test(viewBox)) viewBox = '0 0 24 24';

    const colors = new Set();
    let count = 0;
    const NS = 'http://www.w3.org/2000/svg';
    const out = document.implementation.createDocument(NS, 'svg', null).documentElement;
    out.setAttribute('xmlns', NS);
    out.setAttribute('viewBox', viewBox.trim());

    const copy = (src, dst) => {
        for (const child of Array.from(src.childNodes)) {
            if (child.nodeType === 3 && src.nodeName.toLowerCase() !== 'svg') { dst.append(child.nodeValue); continue; }
            if (child.nodeType !== 1) continue;
            const tag = child.localName.toLowerCase();
            if (!SVG_TAGS.has(tag) || tag === 'svg') {
                // Вложенный svg и ссылки <a> разворачиваем: фигуры оставляем, обёртку (и ссылку) выбрасываем
                if (tag === 'svg' || tag === 'a' || tag === 'switch') copy(child, dst);
                continue;
            }
            if (++count > 4000) throw new Error('Слишком сложный файл (больше 4000 элементов).');
            const node = out.ownerDocument.createElementNS(NS, child.localName);
            for (const a of Array.from(child.attributes)) {
                const name = a.name.toLowerCase();
                if (!SVG_ATTRS.has(name)) continue;
                let v = a.value;
                if (name === 'style') { v = cleanStyle(v); if (!v) continue; }
                else if (!safeValue(name, v)) continue;
                if (name === 'xlink:href') { node.setAttribute('href', v); continue; }
                node.setAttribute(a.name, v);
                if ((name === 'fill' || name === 'stroke' || name === 'stop-color') && !/^(none|currentColor|url\(|transparent|inherit)/i.test(v)) colors.add(v.toLowerCase());
            }
            if (tag !== 'title') dst.append(node);
            copy(child, node);
        }
    };
    copy(root, out);
    if (!count) throw new Error('В файле нет фигур.');
    const svg = new XMLSerializer().serializeToString(out);
    if (svg.length > MAX_SVG_BYTES) throw new Error('Файл больше 150 КБ — упростите иконку.');
    return { svg, viewBox, colors: colors.size };
}

// Превращает сохранённый SVG в <symbol>. tint — перекрасить всё в цвет кнопки (currentColor).
function customSymbol(id, icon) {
    let clean;
    try { clean = sanitizeSvg(icon.svg); } catch (_) { return null; } // повторная проверка при каждой загрузке
    const doc = new DOMParser().parseFromString(clean.svg, 'image/svg+xml');
    const NS = 'http://www.w3.org/2000/svg';
    const symbol = document.createElementNS(NS, 'symbol');
    symbol.id = `i-${id}`;
    symbol.setAttribute('viewBox', clean.viewBox);
    // Обёртка сбрасывает стили встроенных иконок (контур 1.8, без заливки)
    const wrap = document.createElementNS(NS, 'g');
    wrap.setAttribute('fill', icon.tint ? 'currentColor' : '#000');
    wrap.setAttribute('stroke', 'none');
    wrap.setAttribute('stroke-width', '1');
    const prefix = `${id}-`;
    const all = [];
    for (const n of Array.from(doc.documentElement.childNodes)) { const c = document.importNode(n, true); wrap.append(c); }
    wrap.querySelectorAll('*').forEach(n => all.push(n));
    for (const n of all) {
        // Уникальные id, чтобы градиенты разных иконок не путались
        if (n.id) n.id = prefix + n.id;
        for (const a of ['fill', 'stroke', 'clip-path', 'mask', 'style', 'href']) {
            const v = n.getAttribute(a);
            if (!v) continue;
            let nv = v.replace(/url\(\s*['"]?#([\w-]+)['"]?\s*\)/g, (m, ref) => `url(#${prefix}${ref})`);
            if (a === 'href') nv = v.replace(/^#/, `#${prefix}`);
            if (icon.tint && (a === 'fill' || a === 'stroke') && !/^(none|url\()/i.test(nv)) nv = 'currentColor';
            if (icon.tint && a === 'style') nv = nv.replace(/(^|;)\s*(fill|stroke)\s*:\s*(?!none|url\()[^;]+/gi, '$1$2:currentColor');
            n.setAttribute(a, nv);
        }
        if (icon.tint && n.localName === 'stop') n.setAttribute('stop-color', 'currentColor');
    }
    symbol.append(wrap);
    return symbol;
}

let customSprite = null, customKey = '';
function installCustomIcons(icons) {
    icons = icons || {};
    const key = Object.entries(icons).map(([id, i]) => `${id}:${i.tint ? 1 : 0}`).join(',');
    if (key === customKey && customSprite) return;
    customKey = key;
    const NS = 'http://www.w3.org/2000/svg';
    if (!customSprite) {
        customSprite = document.createElementNS(NS, 'svg');
        customSprite.setAttribute('width', '0');
        customSprite.setAttribute('height', '0');
        customSprite.style.position = 'absolute';
        document.body.prepend(customSprite);
    }
    customSprite.textContent = '';
    for (const id of Object.keys(ICONS)) if (ICONS[id].custom) delete ICONS[id];
    for (const [id, icon] of Object.entries(icons)) {
        const sym = customSymbol(id, icon);
        if (!sym) continue;
        customSprite.append(sym);
        ICONS[id] = { name: icon.name, custom: true, tint: !!icon.tint };
    }
}

function iconEl(id, color) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    if (color) svg.style.color = color;
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', `#i-${ICONS[id] ? id : 'star'}`);
    svg.append(use);
    return svg;
}

if (typeof module !== 'undefined') module.exports = { ICON_GROUPS, ICONS, ICON_COLORS, DEFAULT_COLOR, installIcons, installCustomIcons, sanitizeSvg, iconEl };
