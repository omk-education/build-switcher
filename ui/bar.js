'use strict';

/* Панель кнопок билдов поверх игры. */
/* global $, el, tr, send, handlers, colorOf, applyLook, collectStatic, setLanguage, installIcons, installCustomIcons, iconEl, ROLE_LABELS */

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

    const box = $('bar');
    box.textContent = '';
    box.classList.toggle('column', o.layout === 'column');
    box.classList.toggle('no-bg', !o.buttonBg);
    box.style.setProperty('--isz', `${o.iconSize}px`);

    if (!s.builds.length) {
        box.append(el('button', { class: 'bar-empty', on: { click: () => send('openManager') } }, s.character ? tr('Нет билдов') : tr('Зайдите в игру')));
    }
    const blocked = s.busy || (s.inCombat && o.blockInCombat);
    for (const b of s.builds) {
        const title = [tr('Включить «{name}»', { name: b.name })];
        if (b.hotkey) title.push(b.hotkey);
        if (b.role) title.push(tr('Роль в подборе: {role}', { role: tr(ROLE_LABELS[b.role]) }));
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
    const r = $('bar').getBoundingClientRect();
    const z = (state.options.zoom || 100) / 100;
    send('fit', Math.max(r.width, 40) * z, Math.max(r.height, 30) * z);
}

handlers.state = render;
$('b-manager').addEventListener('click', () => send('openManager'));
$('b-close').addEventListener('click', () => send('close'));
send('ready');
