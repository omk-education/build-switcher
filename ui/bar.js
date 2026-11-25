'use strict';

/* Панель кнопок билдов поверх игры. */
/* global $, el, tr, send, handlers, colorOf, applyLook, collectStatic, setLanguage, installIcons, installCustomIcons, iconEl */

installIcons();
collectStatic(['bar']);

let state = null;

function render(s) {
    state = s;
    const o = s.options;
    setLanguage(o.language || 'ru');
    applyLook(o);
    installCustomIcons(s.customIcons);
    document.body.classList.toggle('transparent', !!o.transparentBg);
    document.body.classList.toggle('busy', s.busy);
    // Замок: закрытая дужка — панель закреплена
    document.body.classList.toggle('locked', !!o.barLocked);
    $('b-lock').classList.toggle('on', !!o.barLocked);
    $('b-lock').title = tr(o.barLocked ? 'Панель закреплена — нажмите, чтобы открепить' : 'Закрепить панель');
    $('b-lock-arc').setAttribute('d', o.barLocked ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 8 0');

    const box = $('bar');
    box.textContent = '';
    box.classList.toggle('column', o.layout === 'column');
    box.classList.toggle('no-bg', !o.buttonBg);
    box.style.setProperty('--isz', `${o.iconSize}px`);
    // Фон кнопок: цвет (по теме или свой) и непрозрачность
    const hex = /^#([0-9a-f]{6})$/i.exec(o.buttonBgColor || '');
    const rgb = hex ? [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)).join(',') : getComputedStyle(document.body).getPropertyValue('--tile-theme-rgb').trim();
    const a = (o.buttonBgOpacity === undefined ? 100 : o.buttonBgOpacity) / 100;
    box.style.setProperty('--tile-rgb', rgb);
    box.style.setProperty('--tile-a', String(a));
    box.style.setProperty('--tile-a2', String(Math.min(1, a * 0.75)));
    box.classList.toggle('no-border', o.buttonBorder === false);

    if (!s.builds.length) {
        box.append(el('button', { class: 'bar-empty', on: { click: () => send('openManager') } }, s.character ? tr('Нет билдов') : tr('Зайдите в игру')));
    }
    const blocked = s.busy || (s.inCombat && o.blockInCombat);
    for (const b of s.builds) {
        const title = [tr('Включить «{name}»', { name: b.name })];
        if (b.hotkey) title.push(b.hotkey);
        if (s.inCombat && o.blockInCombat) title.push(tr('недоступно в бою'));
        box.append(el('button', {
            class: `cbtn${b.active ? ' active' : ''}${blocked ? ' blocked' : ''}`,
            title: title.join(' · '),
            on: { click: () => !blocked && send('apply', b.name) }
        },
        el('div', { class: 'big', style: colorOf(b) ? `color:${colorOf(b)}` : null }, iconEl(b.icon)),
        o.labels ? el('span', {}, b.name) : null));
    }
    requestAnimationFrame(fit);
}

// Подгоняем окно под кнопки — без полос прокрутки
function fit() {
    if (!state) return;
    const r = $('wrap').getBoundingClientRect();
    const z = (state.options.zoom || 100) / 100;
    send('fit', Math.max(r.width, 40) * z, Math.max(r.height, 30) * z);
}

// ---------------------------------------------------------------- перетаскивание
// Зажали кнопку мыши на панели (в том числе на кнопке билда) и повели — панель едет за курсором.
// Позицию считает мод по реальному курсору; сдвиг меньше 5 px — обычное нажатие.
let drag = null, swallowClick = false;
document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.bar-tools') || (state && state.options.barLocked)) return;
    drag = { x: e.screenX, y: e.screenY, moving: false, id: e.pointerId };
});
document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moving) {
        if (Math.hypot(e.screenX - drag.x, e.screenY - drag.y) < 5) return;
        drag.moving = true;
        try { document.documentElement.setPointerCapture(drag.id); } catch (_) { /* */ }
        document.body.classList.add('dragging');
        send('dragStart');
    }
    send('dragMove');
});
function endDrag() {
    if (!drag) return;
    if (drag.moving) {
        send('dragEnd');
        swallowClick = true;
        setTimeout(() => { swallowClick = false; }, 50);
        try { document.documentElement.releasePointerCapture(drag.id); } catch (_) { /* */ }
    }
    drag = null;
    document.body.classList.remove('dragging');
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
// После перетаскивания не включаем билд, на котором отпустили кнопку
document.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);

handlers.state = render;
$('b-manager').addEventListener('click', () => send('openManager'));
$('b-lock').addEventListener('click', () => send('toggleLock'));
$('b-close').addEventListener('click', () => send('close'));
send('ready');
