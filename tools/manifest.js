'use strict';

/*
 * Генерирует manifest.json для автообновления через TERA Toolbox.
 * Toolbox скачивает <servers[0]>/manifest.json и обновляет файлы, у которых не совпал SHA-256.
 *
 *   node tools/manifest.js          — пересобрать manifest.json
 *   node tools/manifest.js --check  — проверить, что manifest.json актуален (для CI)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
// Не публикуем: служебные файлы репозитория и локальные настройки пользователя
const EXCLUDE = new Set(['.git', '.github', '.gitignore', '.gitattributes', 'tools', 'manifest.json', 'config.json', 'node_modules']);

function walk(dir, rel = '') {
    let out = [];
    for (const name of fs.readdirSync(dir).sort()) {
        if (!rel && EXCLUDE.has(name)) continue;
        if (name.startsWith('.')) continue;
        const full = path.join(dir, name);
        const relPath = rel ? `${rel}/${name}` : name;
        if (fs.statSync(full).isDirectory()) out = out.concat(walk(full, relPath));
        else out.push(relPath);
    }
    return out;
}

const files = {};
for (const file of walk(ROOT))
    files[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

const text = JSON.stringify({ files }, null, 4) + '\n';
const target = path.join(ROOT, 'manifest.json');

if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== text) {
        console.error('manifest.json устарел: выполните `node tools/manifest.js` и закоммитьте результат.');
        process.exit(1);
    }
    console.log(`manifest.json актуален (${Object.keys(files).length} файлов).`);
} else {
    fs.writeFileSync(target, text);
    console.log(`manifest.json обновлён (${Object.keys(files).length} файлов).`);
}
