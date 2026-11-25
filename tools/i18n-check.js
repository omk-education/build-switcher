'use strict';

/*
 * Проверка переводов: все строки, переданные в T()/tr()/this.core.T()/core.T(), и весь
 * статичный русский текст из ui/index.html должны быть в словаре каждого языка из ui/i18n.js.
 *   node tools/i18n-check.js
 */

const fs = require('fs');
const path = require('path');
const { DICT } = require('../ui/i18n.js');

const ROOT = path.join(__dirname, '..');
const CYR = /[А-Яа-яЁё]/;
const keys = new Map(); // ключ -> где встречается

function add(key, where) { if (CYR.test(key) && !keys.has(key)) keys.set(key, where); }

for (const file of ['index.js', 'lib/gui.js', 'ui/app.js', 'ui/bar.js', 'ui/common.js']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const re = /\b(?:T|tr)\(\s*'((?:[^'\\]|\\.)*)'/g;
    let m;
    while ((m = re.exec(src))) add(m[1].replace(/\\'/g, '\''), file);
    // T(условие ? 'a' : 'b')
    const re2 = /\b(?:T|tr)\([^'()]*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
    while ((m = re2.exec(src))) { add(m[1], file); add(m[2], file); }
}

// Таблицы, которые переводятся при выводе
const app = fs.readFileSync(path.join(ROOT, 'ui/app.js'), 'utf8');
for (const name of ['PART_LABELS', 'THEME_NAMES']) {
    const block = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(app);
    if (block) for (const m of block[1].matchAll(/'([^']*)'/g)) add(m[1], `ui/app.js ${name}`);
}
add(/const CUSTOM_TAB = '([^']*)'/.exec(app)[1], 'ui/app.js CUSTOM_TAB');
// Пары [значение, 'подпись'] (например, роли в редакторе)
for (const m of app.matchAll(/\['\w*', '([^']*)'\]/g)) add(m[1], 'ui/app.js list');
const common = fs.readFileSync(path.join(ROOT, 'ui/common.js'), 'utf8');
for (const m of /const ROLE_LABELS = \{([^}]*)\}/.exec(common)[1].matchAll(/'([^']*)'/g)) add(m[1], 'ui/common.js ROLE_LABELS');
const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
for (const m of /const SLOT_NAMES = \{([\s\S]*?)\};/.exec(idx)[1].matchAll(/'([^']*)'/g)) add(m[1], 'index.js SLOT_NAMES');
for (const m of /const ROLE_NAMES = \{([^}]*)\}/.exec(idx)[1].matchAll(/'([^']*)'/g)) add(m[1], 'index.js ROLE_NAMES');
for (const m of idx.matchAll(/label: '([^']*)'/g)) add(m[1], 'index.js label');
const icons = fs.readFileSync(path.join(ROOT, 'ui/icons.js'), 'utf8');
for (const m of icons.matchAll(/name: '([^']*)'/g)) add(m[1], 'ui/icons.js group');
for (const m of icons.matchAll(/\['([^']*)', `/g)) add(m[1], 'ui/icons.js icon');
for (const m of icons.matchAll(/throw new Error\('([^']*)'\)/g)) add(m[1], 'ui/icons.js error');

// Статичный HTML: текст между тегами, title, placeholder, data-options, data-unit, data-zero
const html = ['ui/index.html', 'ui/bar.html'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n').replace(/<svg[\s\S]*?<\/svg>/g, '');
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = m[1].trim(); if (t) add(t, 'ui/index.html'); }
for (const m of html.matchAll(/(?:title|placeholder|data-zero|data-unit)="([^"]*)"/g)) add(m[1], 'ui/index.html attr');
for (const m of html.matchAll(/data-options="([^"]*)"/g)) for (const opt of m[1].split('|')) add(opt.split(':')[1], 'ui/index.html option');

let missing = 0;
for (const [lang, dict] of Object.entries(DICT)) {
    for (const [key, where] of keys) {
        if (!Object.prototype.hasOwnProperty.call(dict, key)) { console.log(`[${lang}] нет перевода (${where}): ${key}`); missing++; }
    }
    for (const key of Object.keys(dict)) {
        const params = s => (s.match(/\{\w+\}/g) || []).sort().join();
        if (params(key) !== params(dict[key])) { console.log(`[${lang}] подстановки не совпадают: ${key}`); missing++; }
    }
}
console.log(`Ключей: ${keys.size}, языков: ${Object.keys(DICT).length}, проблем: ${missing}`);
process.exit(missing ? 1 : 0);
