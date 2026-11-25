'use strict';

/*
 * build-switcher — переключение пресетов танк / ДД для TERA Toolbox (patch 100.02 x64, Asura).
 *
 * Что переключается:
 *   1. Символы (glyphs)            — C_CREST_APPLY_LIST / C_CREST_APPLY (структуры известны)
 *   2. Страница талантов (EP)      — C_LOAD_EP_PAGE (структура неизвестна -> мод запоминает пакет клиента)
 *   3. Опции "Улучшение умений"    — C_RQ_SKILL_POLISHING_CHANGE_OPTION (структура неизвестна -> запоминается)
 *
 * Пакеты, структура которых не описана в tera-data, мод «выучивает»: когда вы сами нажимаете кнопку
 * в игре, мод сохраняет тело пакета и потом отправляет такое же. Integrity-хэш (padding) toolbox
 * пересчитывает сам при отправке, поэтому повтор пакета безопасен.
 */

const NOISY = new Set([
    'C_PLAYER_LOCATION', 'C_NOTIFY_LOCATION_IN_ACTION', 'C_NOTIFY_LOCATION_IN_DASH', 'C_START_SKILL',
    'C_START_TARGETED_SKILL', 'C_START_COMBO_INSTANT_SKILL', 'C_START_INSTANCE_SKILL', 'C_START_INSTANCE_SKILL_EX',
    'C_PRESS_SKILL', 'C_CAN_LOCKON_TARGET', 'C_PONG', 'C_REQUEST_GAMESTAT_PING', 'C_UPDATE_REACTION_POS',
    'C_CANCEL_SKILL', 'C_HIT_USER_PROJECTILE', 'C_VISIT_NEW_SECTION', 'C_PLAYER_FLYING_LOCATION', 'C_NOTIMELINE_SKILL'
]);
const DEBUG_INCOMING = /CREST|_EP_|EPPERK|POLISHING/;

const I18N = require('./ui/i18n.js');

module.exports = function BuildSwitcher(mod) {
    const command = mod.command;

    // ------------------------------------------------------------------ состояние
    const st = {
        crests: new Map(),        // id символа -> включён?
        crestsKnown: false,
        crestFail: false,
        epPreset: null,           // активная страница талантов (как в пакете)
        epUnlocked: null,
        polish: new Map(),        // группа улучшения -> id активной опции (0 = не выбрана)
        polishGroupOf: new Map(), // id опции -> группа
        polishKnown: false
    };
    let busy = false;
    let debug = false;
    let sniffHook = null;
    let pendingEp = null;     // пакет C_LOAD_EP_PAGE от клиента, ждём ответа сервера
    let pendingPolish = null; // пакет C_RQ_SKILL_POLISHING_CHANGE_OPTION от клиента
    let pendingPolishTimer = null;
    const nameCache = new Map();

    const S = () => mod.settings;
    const L = () => S().learned;
    // Перевод: ключ — русская строка (базовый язык), см. ui/i18n.js
    const T = (key, params) => I18N.translate(S().language || 'ru', key, params);

    function msg(text) { command.message(text); }
    function dbg(text) { if (debug) { mod.log(text); } }
    function save() { mod.saveSettings(); }
    function sleep(ms) { return new Promise(resolve => mod.setTimeout(resolve, ms)); }

    function resetState() {
        st.crests.clear(); st.crestsKnown = false; st.crestFail = false;
        st.epPreset = null; st.epUnlocked = null;
        st.polish.clear(); st.polishGroupOf.clear(); st.polishKnown = false;
        pendingEp = null; pendingPolish = null;
    }

    // ------------------------------------------------------------------ работа с сырыми пакетами
    function opcode(name) { return mod.dispatch.protocolMap.name.get(name); }
    function payloadOffset(code) { return 4 + (mod.dispatch.protocolMap.padding[code] ? 8 : 0); }

    function capture(code, data) {
        const off = payloadOffset(code);
        return { off, hex: data.slice(off).toString('hex') };
    }

    // Собирает пакет name из выученного тела. null — если опкод неизвестен или изменился формат padding.
    function buildPacket(name, cap) {
        const code = opcode(name);
        if (code === undefined || !cap) return null;
        const off = payloadOffset(code);
        if (off !== cap.off) return null;
        const body = Buffer.from(cap.hex, 'hex');
        const buf = Buffer.alloc(off + body.length);
        buf.writeUInt16LE(buf.length, 0);
        buf.writeUInt16LE(code, 2);
        body.copy(buf, off);
        return buf;
    }

    function findUInt32(buf, value, skip = -1) {
        for (let i = 0; i + 4 <= buf.length; i++) {
            if (skip >= 0 && i > skip - 4 && i < skip + 4) continue;
            if (buf.readUInt32LE(i) === value) return i;
        }
        return -1;
    }

    // Ищет в теле пакета id известной опции улучшения (и id группы).
    function findPolishOption(body) {
        for (let i = 0; i + 4 <= body.length; i++) {
            const v = body.readUInt32LE(i);
            if (v && st.polishGroupOf.has(v)) {
                const group = st.polishGroupOf.get(v);
                return { id: v, idOff: i, group, groupOff: findUInt32(body, group, i) };
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ обучение
    function learnEp(cap, preset) {
        L().epPages[preset] = cap;
        const body = Buffer.from(cap.hex, 'hex');
        if (body.length === 4)
            L().epTemplate = { off: cap.off, hex: cap.hex, delta: body.readUInt32LE(0) - preset };
        save();
        dbg(`learned C_LOAD_EP_PAGE for page ${preset}: ${cap.hex}`);
    }

    function epPacketFor(preset) {
        const known = L().epPages[preset];
        if (known) return buildPacket('C_LOAD_EP_PAGE', known);
        const t = L().epTemplate;
        if (t) {
            const body = Buffer.alloc(4);
            body.writeUInt32LE((preset + t.delta) >>> 0, 0);
            return buildPacket('C_LOAD_EP_PAGE', { off: t.off, hex: body.toString('hex') });
        }
        return null;
    }

    function learnPolish(cap, id, found) {
        L().polish[id] = { off: cap.off, hex: cap.hex };
        if (found)
            L().polishTemplate = { off: cap.off, hex: cap.hex, idOff: found.idOff, groupOff: found.groupOff, group: found.group };
        save();
        dbg(`learned C_RQ_SKILL_POLISHING_CHANGE_OPTION for option ${id}: ${cap.hex}`);
    }

    function polishPacketFor(group, id) {
        const known = L().polish[id];
        if (known) return buildPacket('C_RQ_SKILL_POLISHING_CHANGE_OPTION', known);
        const t = L().polishTemplate;
        if (t) {
            // id опции уникален, поэтому достаточно подставить его (и id группы, если он есть в пакете)
            const body = Buffer.from(t.hex, 'hex');
            body.writeUInt32LE(id >>> 0, t.idOff);
            if (t.groupOff >= 0) body.writeUInt32LE(group >>> 0, t.groupOff);
            return buildPacket('C_RQ_SKILL_POLISHING_CHANGE_OPTION', { off: t.off, hex: body.toString('hex') });
        }
        return null;
    }

    function finishPendingPolish() {
        if (pendingPolishTimer) { mod.clearTimeout(pendingPolishTimer); pendingPolishTimer = null; }
        pendingPolish = null;
    }

    // ------------------------------------------------------------------ хуки
    const watch = { order: 100, filter: { fake: null, modified: null, silenced: null } };
    const fromClient = { order: -100, filter: { fake: false, incoming: false, modified: null, silenced: null } };

    function hook(name, version, opts, cb) {
        const h = mod.tryHook(name, version, opts, cb);
        if (!h) mod.warn(T('Не удалось подписаться на {hook} — эта часть мода работать не будет.', { hook: `${name}.${version}` }));
        return h;
    }

    mod.game.on('leave_game', () => { resetState(); changed(); });
    mod.game.on('enter_game', () => changed());

    // --- символы
    hook('S_CREST_INFO', 2, watch, e => {
        st.crests.clear();
        for (const c of e.crests) st.crests.set(c.id, !!c.enable);
        st.crestsKnown = true;
        changed();
    });
    hook('S_CREST_APPLY', 2, watch, e => { st.crests.set(e.id, !!e.enable); changed(); });
    hook('S_CREST_CHANGE_FAIL', 1, watch, () => {
        st.crestFail = true;
        // Набор отклонён сервером при ручном переключении в игре — подскажем причину
        if (!busy) {
            const text = T('Набор символов не сменился: открыто другое окно взаимодействия (NPC, банк, торговля, крафт…). Закройте его и повторите.');
            msg(text);
            setReport(text, 'warn');
        }
    });

    // --- открытые окна взаимодействия (контракты): пока они открыты, сервер не меняет набор символов целиком
    let contract = null;
    try {
        mod.game.initialize('contract');
        contract = mod.game.contract;
        contract.on('begin', () => changed());
        contract.on('end', () => changed());
    } catch (e) { mod.warn(T('tera-game-state: contract недоступен — проверка открытых окон отключена.')); }
    function openWindow() { return contract && contract.active ? { type: contract.type } : null; }

    // --- экипировка (tera-game-state inventory)
    // Слоты снаряжения: 1 оружие, 3 тело, 4 руки, 5 ноги, 6-7 серьги, 8-9 кольца, 10 ожерелье, 11 бельё,
    // 12 голова (циркулет), 13 лицо (маска), 19 пояс, 20 брошь, 22-23 реликвии.
    // Костюмы — отдельная часть билда: 14 головной убор, 15 маска, 16 оружие (облик), 17 костюм, 18 спина, 21 следы.
    const GEAR_SLOTS = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19, 20, 22, 23];
    const COSTUME_SLOTS = [14, 15, 16, 17, 18, 21];
    const SLOT_NAMES = { 1: 'оружие', 3: 'нагрудник', 4: 'перчатки', 5: 'обувь', 6: 'серьга', 7: 'серьга', 8: 'кольцо', 9: 'кольцо',
        10: 'ожерелье', 11: 'бельё', 12: 'голова', 13: 'маска', 19: 'пояс', 20: 'брошь', 22: 'реликвия', 23: 'реликвия',
        14: 'костюм: голова', 15: 'костюм: лицо', 16: 'облик оружия', 17: 'костюм', 18: 'спина', 21: 'следы' };
    const slotName = slot => (SLOT_NAMES[slot] ? T(SLOT_NAMES[slot]) : T('слот {n}', { n: slot }));
    let inventory = null;
    try {
        mod.game.initialize('inventory');
        inventory = mod.game.inventory;
        inventory.on('update', () => changed());
    } catch (e) { mod.warn(T('tera-game-state: inventory недоступен — переключение экипировки отключено.')); }

    function equipKnown() { return !!(inventory && inventory.equipment && inventory.equipment.slots && Object.keys(inventory.equipment.slots).length); }
    function equipSnapshot(slots = GEAR_SLOTS) {
        const out = {};
        for (const slot of slots) {
            const it = inventory.equipment.slots[slot];
            if (!it) continue;
            out[slot] = {
                id: it.id, dbid: String(it.dbid), passivitySet: it.passivitySet | 0,
                crystals: (it.crystals || []).filter(Boolean),
                name: (it.data && it.data.name) || null
            };
        }
        return out;
    }
    function equipDiff(saved) {
        const cur = inventory.equipment.slots;
        return Object.entries(saved).filter(([slot, it]) => !cur[slot] || cur[slot].dbid === undefined || String(cur[slot].dbid) !== it.dbid).map(([slot]) => +slot);
    }

    // C_CHANGE_EQUIP_PRESET собираем вручную: JS-определение в tera-data ломается при записи
    // (обращается к несуществующей переменной). Разметка — из его же функции чтения:
    // u16 countItems, u16 offItems, u16 countCrystals, u16 offCrystals, u64 gameId,
    // затем элементы предметов (20 байт) вперемешку с кристаллами своего слота (12 байт), как у клиента.
    function equipPresetPacket(items, crystals) {
        const code = opcode('C_CHANGE_EQUIP_PRESET');
        if (code === undefined) return null;
        const base = payloadOffset(code);
        const size = base + 16 + items.length * 20 + crystals.length * 12;
        const buf = Buffer.alloc(size);
        buf.writeUInt16LE(size, 0);
        buf.writeUInt16LE(code, 2);
        buf.writeUInt16LE(items.length, base);
        buf.writeUInt16LE(crystals.length, base + 4);
        buf.writeBigUInt64LE(BigInt(mod.game.me.gameId), base + 8);
        let pos = base + 16, prevItem = base + 2, prevCrystal = base + 6;
        for (const it of items) {
            buf.writeUInt16LE(pos, prevItem);
            buf.writeUInt16LE(pos, pos);
            prevItem = pos + 2;
            buf.writeUInt32LE(it.slot, pos + 4);
            buf.writeBigUInt64LE(BigInt(it.dbid), pos + 8);
            buf.writeUInt32LE(it.passivitySet >>> 0, pos + 16);
            pos += 20;
            for (const c of crystals.filter(x => x.slot === it.slot)) {
                buf.writeUInt16LE(pos, prevCrystal);
                buf.writeUInt16LE(pos, pos);
                prevCrystal = pos + 2;
                buf.writeUInt32LE(c.slot, pos + 4);
                buf.writeUInt32LE(c.id >>> 0, pos + 8);
                pos += 12;
            }
        }
        return buf;
    }

    function parseEquipPreset(code, data) {
        const base = payloadOffset(code);
        const res = { items: [], crystals: [] };
        let off = data.readUInt16LE(base + 2), n = data.readUInt16LE(base);
        while (off && n-- > 0 && off + 20 <= data.length) {
            res.items.push({ slot: data.readUInt32LE(off + 4), dbid: data.readBigUInt64LE(off + 8).toString(), passivitySet: data.readUInt32LE(off + 16) });
            off = data.readUInt16LE(off + 2);
        }
        off = data.readUInt16LE(base + 6); n = data.readUInt16LE(base + 4);
        while (off && n-- > 0 && off + 12 <= data.length) {
            res.crystals.push({ slot: data.readUInt32LE(off + 4), id: data.readUInt32LE(off + 8) });
            off = data.readUInt16LE(off + 2);
        }
        return res;
    }

    // Если клиент сам отправит набор экипировки — сверяем с нашей сборкой пакета (для отладки)
    hook('C_CHANGE_EQUIP_PRESET', 'raw', fromClient, (code, data) => {
        try {
            const parsed = parseEquipPreset(code, data);
            const ours = equipPresetPacket(parsed.items, parsed.crystals);
            const same = ours && ours.slice(payloadOffset(code)).equals(data.slice(payloadOffset(code)));
            dbg(`C_CHANGE_EQUIP_PRESET (client): ${parsed.items.length} предметов, ${parsed.crystals.length} кристаллов; сборка мода ${same ? 'совпадает' : 'ОТЛИЧАЕТСЯ'}: ${data.toString('hex')}`);
            if (!same) mod.warn(T('C_CHANGE_EQUIP_PRESET от клиента не совпал со сборкой мода: {hex}', { hex: data.toString('hex') }));
        } catch (e) { dbg(`C_CHANGE_EQUIP_PRESET parse error: ${e.message}`); }
    });

    // Надевает сохранённые предметы одним пакетом. groups: [{ saved, label }] — экипировка и/или костюмы.
    async function applyEquip(groups, delay) {
        const label = g => T(g.label);
        if (!equipKnown()) return { texts: groups.map(g => T('{part}: состояние неизвестно (откройте инвентарь)', { part: label(g) })), warn: true };
        const saved = Object.assign({}, ...groups.map(g => g.saved));
        const diff = equipDiff(saved);
        if (!diff.length) return { texts: groups.map(g => T('{part}: уже', { part: label(g) })) };

        const owned = dbid => !!inventory.dbids[dbid] || Object.values(inventory.dbids).some(x => String(x.dbid) === dbid);
        const missing = diff.filter(slot => !owned(saved[slot].dbid));
        const want = {};
        // Берём всё надетое сейчас (чтобы не снять то, что билд не трогает), поверх — сохранённое
        for (const [slot, it] of Object.entries(inventory.equipment.slots)) {
            if (!it || it.dbid === undefined) continue;
            want[slot] = { slot: +slot, dbid: String(it.dbid), passivitySet: it.passivitySet | 0, crystals: (it.crystals || []).filter(Boolean) };
        }
        for (const [slot, it] of Object.entries(saved)) {
            if (missing.includes(+slot)) continue;
            // предмет мог быть надет в другом слоте (кольца/серьги) — убираем дубль
            for (const k of Object.keys(want)) if (want[k].dbid === it.dbid && +k !== +slot && !(k in saved)) delete want[k];
            want[slot] = { slot: +slot, dbid: it.dbid, passivitySet: it.passivitySet | 0, crystals: it.crystals || [] };
        }
        const items = Object.values(want).sort((x, y) => x.slot - y.slot);
        const crystals = [];
        for (const it of items) for (const id of it.crystals) crystals.push({ slot: it.slot, id });
        const pkt = equipPresetPacket(items, crystals);
        if (!pkt) return { texts: [T('экипировка: пакет C_CHANGE_EQUIP_PRESET неизвестен в этой версии')], warn: true };

        const reply = new Promise(resolve => {
            let done = false;
            const finish = v => { if (!done) { done = true; inventory.removeListener('update', onUpdate); resolve(v); } };
            const onUpdate = () => { if (!equipDiff(saved).filter(x => !missing.includes(x)).length) finish(true); };
            inventory.on('update', onUpdate);
            mod.setTimeout(() => finish(false), 3000);
        });
        mod.toServer(pkt);
        const ok = await reply;
        await sleep(delay);

        const left = equipDiff(saved).filter(x => !missing.includes(x));
        const names = slots => slots.map(sl => saved[sl].name || slotName(sl)).join(', ');
        let warn = false;
        const texts = groups.map(g => {
            const own = slot => slot in g.saved;
            const gDiff = diff.filter(own), gLeft = left.filter(own), gMissing = missing.filter(own);
            let text;
            if (!gDiff.length) text = T('{part}: уже', { part: label(g) });
            else if (!gLeft.length) text = T('{part}: ок ({n})', { part: label(g), n: gDiff.length - gMissing.length });
            else text = T('{part}: сервер не надел {items}', { part: label(g), items: names(gLeft) }) + (ok ? '' : T(' — включите /8 build debug, переоденьтесь вручную и пришлите лог'));
            if (gMissing.length) text += T('; нет в сумке: {items}', { items: names(gMissing) });
            if (gLeft.length || gMissing.length) warn = true;
            return text;
        });
        return { texts, warn };
    }

    // --- таланты
    const epInfoVersion = mod.majorPatchVersion >= 105 ? 3 : (mod.majorPatchVersion >= 96 ? 2 : 1);
    hook('S_LOAD_EP_INFO', epInfoVersion, watch, e => {
        if (e.activePreset !== undefined) st.epPreset = e.activePreset;
        if (e.numUnlockedAdditionalPresets !== undefined) st.epUnlocked = e.numUnlockedAdditionalPresets;
        changed();
    });
    if (mod.majorPatchVersion >= 96) {
        hook('TTB_S_LOAD_EP_PAGE', 1, watch, e => {
            st.epPreset = e.activePreset;
            st.epUnlocked = e.numUnlockedAdditionalPresets;
            if (pendingEp) { learnEp(pendingEp, e.activePreset); pendingEp = null; }
            changed();
        });
        hook('C_LOAD_EP_PAGE', 'raw', fromClient, (code, data) => {
            pendingEp = capture(code, data);
            dbg(`C_LOAD_EP_PAGE (client): ${pendingEp.hex}`);
        });
    }

    // --- улучшение умений
    hook('S_RP_SKILL_POLISHING_LIST', 1, watch, e => {
        const prev = new Map(st.polish);
        st.polish.clear();
        st.polishGroupOf.clear();
        for (const o of e.optionEffects) {
            st.polishGroupOf.set(o.id, o.group);
            if (!st.polish.has(o.group)) st.polish.set(o.group, 0);
            if (o.active) st.polish.set(o.group, o.id);
        }
        st.polishKnown = true;
        changed();

        // Не смогли понять пакет клиента сразу — определяем по изменению списка
        if (pendingPolish && pendingPolish.id === undefined && prev.size) {
            for (const [group, id] of st.polish) {
                if (id && prev.get(group) !== id) { learnPolish(pendingPolish, id, null); break; }
            }
            finishPendingPolish();
        }
    });

    hook('C_RQ_SKILL_POLISHING_LIST', 'raw', fromClient, (code, data) => {
        const cap = capture(code, data);
        const old = L().polishListRequest;
        if (!old || old.hex !== cap.hex || old.off !== cap.off) { L().polishListRequest = cap; save(); }
    });

    hook('C_RQ_SKILL_POLISHING_CHANGE_OPTION', 'raw', fromClient, (code, data) => {
        const cap = capture(code, data);
        const found = findPolishOption(Buffer.from(cap.hex, 'hex'));
        dbg(`C_RQ_SKILL_POLISHING_CHANGE_OPTION (client): ${cap.hex}${found ? ` -> option ${found.id}, group ${found.group}` : ''}`);
        finishPendingPolish();
        if (found) {
            learnPolish(cap, found.id, found);
            pendingPolish = Object.assign({}, cap, { id: found.id, group: found.group });
        } else {
            pendingPolish = cap;
        }
        pendingPolishTimer = mod.setTimeout(() => { pendingPolishTimer = null; pendingPolish = null; }, 5000);
    });

    hook('S_RP_SKILL_POLISHING_CHANGE_OPTION', 'raw', watch, (code, data) => {
        const body = data.slice(payloadOffset(code));
        dbg(`S_RP_SKILL_POLISHING_CHANGE_OPTION: ${body.toString('hex')}`);
        if (busy || !pendingPolish) return;

        const inReply = findPolishOption(body);
        if (pendingPolish.id === undefined && inReply) learnPolish(pendingPolish, inReply.id, null);

        const id = inReply ? inReply.id : pendingPolish.id;
        if (id !== undefined && st.polishGroupOf.has(id)) {
            st.polish.set(st.polishGroupOf.get(id), id);
            finishPendingPolish();
            changed();
        } else {
            // Ответ не помог — запросим список заново, разберёмся по разнице
            const pkt = buildPacket('C_RQ_SKILL_POLISHING_LIST', L().polishListRequest);
            if (pkt) mod.toServer(pkt);
        }
    });

    // ------------------------------------------------------------------ ожидание ответа сервера
    function waitFor(name, version, timeout, pred = () => true) {
        return new Promise(resolve => {
            let done = false, timer = null, h = null;
            const finish = value => {
                if (done) return;
                done = true;
                if (h) mod.unhook(h);
                if (timer) mod.clearTimeout(timer);
                resolve(value);
            };
            h = mod.tryHook(name, version, { order: 1000, filter: { fake: null, modified: null, silenced: null } }, (...args) => {
                const value = version === 'raw' ? args[1] : args[0];
                if (pred(value)) finish(value);
            });
            if (!h) { finish(null); return; }
            timer = mod.setTimeout(() => finish(null), timeout);
        });
    }

    // ------------------------------------------------------------------ билды
    function charName() { return mod.game.me.name; }
    function charData(create = false) {
        const name = charName();
        if (!name) return null;
        const chars = S().characters;
        if (!chars[name] && create) chars[name] = { builds: {} };
        return chars[name] || null;
    }
    function getBuild(name) {
        const c = charData();
        return c && c.builds[name] ? c.builds[name] : null;
    }

    function enabledCrests() {
        return [...st.crests].filter(([, on]) => on).map(([id]) => id).sort((a, b) => a - b);
    }
    function sameSet(a, b) {
        if (a.length !== b.length) return false;
        const s = new Set(a);
        return b.every(x => s.has(x));
    }

    // Какие части билда переключать: equip — экипировка, talents — таланты, crests — символы (изученные умения),
    // polish — улучшение умений. Старые билды хранили только useCrests.
    const PARTS = ['equip', 'costume', 'talents', 'crests', 'polish'];
    function partOn(b, part) {
        if (b.parts && b.parts[part] !== undefined) return !!b.parts[part];
        if (part === 'crests') return b.useCrests !== false;
        return true;
    }

    function buildMatches(b) {
        const res = { equip: null, costume: null, crests: null, ep: null, polish: null };
        if (b.equip && partOn(b, 'equip') && equipKnown()) res.equip = equipDiff(b.equip).length === 0;
        if (b.costume && Object.keys(b.costume).length && partOn(b, 'costume') && equipKnown()) res.costume = equipDiff(b.costume).length === 0;
        if (b.crests && partOn(b, 'crests') && st.crestsKnown) res.crests = sameSet(enabledCrests(), b.crests);
        if (b.epPreset !== undefined && b.epPreset !== null && partOn(b, 'talents') && st.epPreset !== null) res.ep = st.epPreset === b.epPreset;
        if (b.polish && partOn(b, 'polish') && st.polishKnown) res.polish = Object.entries(b.polish).every(([g, id]) => st.polish.get(+g) === id);
        return res;
    }

    function saveBuild(name) {
        if (!name) { msg(T('Укажите имя: build save tank')); return null; }
        const c = charData(true);
        if (!c) { msg(T('Персонаж не определён — зайдите в игру.')); return null; }

        const b = { savedAt: Date.now() };
        const missing = [];
        if (st.crestsKnown) b.crests = enabledCrests(); else missing.push(T('символы'));
        if (st.epPreset !== null) b.epPreset = st.epPreset; else missing.push(T('таланты'));
        if (st.polishKnown) {
            b.polish = {};
            for (const [group, id] of st.polish) if (id) b.polish[group] = id;
        } else missing.push(T('улучшение умений'));
        if (equipKnown()) { b.equip = equipSnapshot(GEAR_SLOTS); b.costume = equipSnapshot(COSTUME_SLOTS); } else missing.push(T('экипировка'));

        const old = c.builds[name];
        if (old) for (const k of ['icon', 'color', 'hotkey']) if (old[k] !== undefined) b[k] = old[k];
        b.parts = {};
        for (const part of PARTS) b.parts[part] = old ? partOn(old, part) : true;
        c.builds[name] = b;
        save();
        changed();
        msg(T('Билд «{name}» сохранён: экипировка {equip}, символов {crests}, страница талантов {page}, опций улучшения {polish}.', { name, equip: b.equip ? Object.keys(b.equip).length : '—', crests: b.crests ? b.crests.length : '—', page: b.epPreset !== undefined ? b.epPreset + 1 : '—', polish: b.polish ? Object.keys(b.polish).length : '—' }));
        if (missing.length)
            msg(T('Не сохранено (сервер ещё не прислал данные): {list}. Откройте соответствующие окна или перезайдите на персонажа и сохраните снова.', { list: missing.join(', ') }));
        reportUnknownPackets(name, b);
        return missing;
    }

    // Подсказывает, каких пакетов не хватает для переключения на этот билд
    function reportUnknownPackets(name, b) {
        const hints = [];
        if (b.epPreset !== undefined && !epPacketFor(b.epPreset))
            hints.push(T('страница талантов {page}: один раз переключитесь на неё в окне талантов', { page: b.epPreset + 1 }));
        if (b.polish) {
            for (const [g, id] of Object.entries(b.polish))
                if (!polishPacketFor(+g, id)) hints.push(T('улучшение {id}: один раз выберите эту опцию в окне «Улучшение умений»', { id }));
        }
        if (hints.length)
            msg(T('Для «{name}» мод ещё не знает пакеты: {list}.', { name, list: hints.join('; ') }));
    }

    async function applyBuild(name, source = 'chat') {
        const say = text => { if (source === 'chat' || S().chatReports || (source === 'hotkey' && !gui.isOpen())) msg(text); };
        const deny = text => { say(text); setReport(text, 'error'); };
        if (!S().enabled) return deny(T('Мод выключен (build on).'));
        if (busy) return deny(T('Подождите, переключение уже идёт.'));
        const b = getBuild(name);
        if (!b) return deny(T('Билд «{name}» не найден. Сохраните: build save {name}', { name }));
        if (S().blockInCombat && mod.game.me.inCombat) return deny(T('В бою переключать нельзя.'));
        if (mod.game.me.alive === false) return deny(T('Персонаж мёртв.'));
        const win = openWindow();
        if (win && S().crestsWhenBusy === 'abort' && b.crests && partOn(b, 'crests') && st.crestsKnown && !sameSet(enabledCrests(), b.crests))
            return deny(T('Открыто окно взаимодействия — символы сейчас не сменить. Закройте его и повторите.'));

        busy = true;
        changed();
        const delay = Math.max(200, S().delay | 0);
        const report = [];
        let warn = false;
        try {
            const active = PARTS.filter(p => partOn(b, p));
            if (!active.length) report.push(T('в билде не выбрано, что переключать'));

            // 1. Таланты
            if (b.epPreset !== undefined && b.epPreset !== null && partOn(b, 'talents')) {
                if (st.epPreset === b.epPreset) report.push(T('таланты: уже'));
                else {
                    const pkt = epPacketFor(b.epPreset);
                    if (!pkt) report.push(T('таланты: пакет неизвестен (переключите страницу {page} вручную один раз)', { page: b.epPreset + 1 }));
                    else {
                        const reply = waitFor('TTB_S_LOAD_EP_PAGE', 1, 3000);
                        mod.toServer(pkt);
                        const ev = await reply;
                        report.push(T(ev && ev.activePreset === b.epPreset ? 'таланты: ок' : 'таланты: сервер не подтвердил'));
                    }
                    await sleep(delay);
                }
            }

            // 2. Символы (можно отключить для билда: build glyphs <имя> off)
            if (b.crests && partOn(b, 'crests')) {
                if (!st.crestsKnown) report.push(T('символы: состояние неизвестно (откройте окно умений)'));
                else if (sameSet(enabledCrests(), b.crests)) report.push(T('символы: уже'));
                else if (openWindow() && S().crestsWhenBusy === 'skip') {
                    report.push(T('символы: пропущены (открыто окно взаимодействия)'));
                    warn = true;
                } else {
                    const target = b.crests.filter(id => st.crests.has(id));
                    const unknown = b.crests.length - target.length;
                    const busyWindow = !!openWindow();
                    let listRejected = false;

                    // Пока открыто окно взаимодействия, сервер отклоняет набор целиком — сразу ставим по одному
                    if (!busyWindow) {
                        st.crestFail = false;
                        const info = waitFor('S_CREST_INFO', 2, 2000);
                        const fail = waitFor('S_CREST_CHANGE_FAIL', 1, 2000);
                        mod.send('C_CREST_APPLY_LIST', 2, { useResetItem: false, glyphs: target });
                        await Promise.race([info, fail]);
                        listRejected = st.crestFail;
                        await sleep(delay);
                    }

                    // Доводим по одному символу (сначала выключаем лишние, чтобы хватило очков)
                    if (!sameSet(enabledCrests(), target)) {
                        const want = new Set(target);
                        const off = enabledCrests().filter(id => !want.has(id));
                        const on = target.filter(id => !st.crests.get(id));
                        for (const id of off) { mod.send('C_CREST_APPLY', 2, { id, enable: false }); await sleep(delay); }
                        for (const id of on) { mod.send('C_CREST_APPLY', 2, { id, enable: true }); await sleep(delay); }
                        await sleep(delay);
                    }
                    const ok = sameSet(enabledCrests(), target);
                    let text = T(ok ? 'символы: ок' : 'символы: не применились — закройте окна взаимодействия и повторите');
                    if (ok && (busyWindow || listRejected)) { text += T(' (открыто окно — переставлены по одному)'); warn = true; }
                    if (!ok) warn = true;
                    if (unknown) text += T(' ({n} не изучено)', { n: unknown });
                    report.push(text);
                }
            }

            // 3. Улучшение умений
            if (b.polish && Object.keys(b.polish).length && partOn(b, 'polish')) {
                let changed = 0, already = 0;
                const failed = [];
                if (!st.polishKnown) {
                    const listPkt = buildPacket('C_RQ_SKILL_POLISHING_LIST', L().polishListRequest);
                    if (listPkt) {
                        const reply = waitFor('S_RP_SKILL_POLISHING_LIST', 1, 2000);
                        mod.toServer(listPkt);
                        await reply;
                    }
                }
                for (const [g, id] of Object.entries(b.polish)) {
                    const group = +g;
                    if (st.polishKnown && st.polish.get(group) === id) { already++; continue; }
                    const pkt = polishPacketFor(group, id);
                    if (!pkt) { failed.push(T('{id} (пакет неизвестен)', { id })); continue; }
                    const reply = waitFor('S_RP_SKILL_POLISHING_CHANGE_OPTION', 'raw', 2500);
                    mod.toServer(pkt);
                    const resp = await reply;
                    if (resp) { st.polish.set(group, id); changed++; } else failed.push(T('{id} (нет ответа)', { id }));
                    await sleep(delay);
                }
                const parts = [];
                if (changed) parts.push(T('изменено {n}', { n: changed }));
                if (already) parts.push(T('уже {n}', { n: already }));
                if (failed.length) parts.push(T('ошибка: {list}', { list: failed.join(', ') }));
                report.push(T('улучшение: {list}', { list: parts.join(', ') || '—' }));

                // Сверяемся с сервером, если умеем запросить список
                const listPkt = buildPacket('C_RQ_SKILL_POLISHING_LIST', L().polishListRequest);
                if (changed && listPkt) {
                    const reply = waitFor('S_RP_SKILL_POLISHING_LIST', 1, 2000);
                    mod.toServer(listPkt);
                    await reply;
                }
            }

            // 4. Экипировка и костюмы — одним пакетом (последними: самый тяжёлый шаг)
            const gearGroups = [];
            if (b.equip && Object.keys(b.equip).length && partOn(b, 'equip')) gearGroups.push({ saved: b.equip, label: 'экипировка' });
            if (b.costume && Object.keys(b.costume).length && partOn(b, 'costume')) gearGroups.push({ saved: b.costume, label: 'костюмы' });
            if (gearGroups.length) {
                if (!inventory) report.push(T('экипировка: недоступна'));
                else {
                    const r = await applyEquip(gearGroups, delay);
                    report.push(...r.texts);
                    if (r.warn) warn = true;
                }
            }

            const c = charData(true);
            if (c) { c.active = name; save(); }
            say(T('Билд «{name}»: {report}', { name, report: report.join(' | ') }));
            setReport(T('«{name}»: {report}', { name, report: report.join(' | ') }), warn ? 'warn' : 'ok');
        } catch (e) {
            mod.error(e);
            say(T('Ошибка при переключении: {err}', { err: e.message }));
            setReport(T('Ошибка: {err}', { err: e.message }), 'error');
        } finally {
            busy = false;
            changed();
        }
    }

    // ------------------------------------------------------------------ окно мода и горячие клавиши (lib/gui.js)
    let lastReport = null;

    function setReport(text, level = 'ok') {
        if (level === true) level = 'error';
        lastReport = { text, level, time: Date.now() };
        changed();
    }

    const NAME_RE = /^[\wа-яё-]{1,24}$/i;
    const itemList = saved => (saved ? Object.entries(saved).map(([slot, it]) => ({
        slot: +slot, slotName: slotName(slot), name: it.name || T('предмет {id}', { id: it.id }),
        equipped: !!(equipKnown() && inventory.equipment.slots[slot] && String(inventory.equipment.slots[slot].dbid) === it.dbid)
    })) : []);
    const core = {
        mod, msg, save, T,
        settings: S,
        charName,
        isBusy: () => busy,
        applyBuild,
        saveBuild,
        setReport,
        state() {
            const c = charData();
            const builds = c ? Object.entries(c.builds).map(([name, b]) => {
                const m = buildMatches(b);
                const vals = Object.values(m);
                const missing = [];
                if (b.epPreset !== undefined && partOn(b, 'talents') && !epPacketFor(b.epPreset)) missing.push(T('страница талантов {page}', { page: b.epPreset + 1 }));
                if (b.polish && partOn(b, 'polish')) for (const [g, id] of Object.entries(b.polish)) if (!polishPacketFor(+g, id)) missing.push(T('улучшение {id}', { id }));
                return {
                    name,
                    icon: b.icon || (/tank|танк|def/i.test(name) ? 'shield' : (/dd|дд|dps|дпс|dmg/i.test(name) ? 'sword' : 'star')),
                    color: b.color || '',
                    hotkey: b.hotkey || '',
                    useCrests: partOn(b, 'crests'),
                    parts: Object.fromEntries(PARTS.map(p => [p, partOn(b, p)])),
                    equip: b.equip ? Object.keys(b.equip).length : null,
                    equipList: itemList(b.equip),
                    costume: b.costume && Object.keys(b.costume).length ? Object.keys(b.costume).length : null,
                    costumeList: itemList(b.costume),
                    crests: b.crests ? b.crests.length : null,
                    epPreset: b.epPreset !== undefined ? b.epPreset : null,
                    polish: b.polish ? Object.keys(b.polish).length : null,
                    match: m,
                    active: vals.every(v => v !== false) && vals.some(v => v === true),
                    missing,
                    savedAt: b.savedAt || null
                };
            }) : [];
            const win = openWindow();
            return {
                character: charName() || null,
                busy,
                inCombat: !!mod.game.me.inCombat,
                openWindow: win,
                current: {
                    equip: equipKnown() ? GEAR_SLOTS.filter(sl => inventory.equipment.slots[sl]).length : null,
                    costume: equipKnown() ? COSTUME_SLOTS.filter(sl => inventory.equipment.slots[sl]).length : null,
                    epPreset: st.epPreset,
                    crests: st.crestsKnown ? enabledCrests().length : null,
                    polish: st.polishKnown ? [...st.polish.values()].filter(Boolean).length : null
                },
                builds,
                report: lastReport,
                learned: {
                    epPages: Object.keys(L().epPages).length, epTemplate: !!L().epTemplate,
                    polish: Object.keys(L().polish).length, polishTemplate: !!L().polishTemplate
                }
            };
        },
        builds() { const c = charData(); return c ? c.builds : {}; },
        allBuilds() {
            const out = [];
            for (const c of Object.values(S().characters || {})) for (const b of Object.values(c.builds || {})) out.push(b);
            return out;
        },
        deleteBuild(name) {
            const c = charData();
            if (!c || !c.builds[name]) return false;
            delete c.builds[name];
            save(); changed();
            return true;
        },
        renameBuild(from, to) {
            const c = charData();
            to = String(to || '').trim();
            if (!c || !c.builds[from]) return T('Билд не найден.');
            if (!NAME_RE.test(to)) return T('Имя: буквы, цифры, «-» и «_», до 24 символов.');
            if (to !== from && c.builds[to]) return T('Билд «{name}» уже есть.', { name: to });
            const entries = Object.entries(c.builds).map(([k, v]) => [k === from ? to : k, v]);
            c.builds = Object.fromEntries(entries);
            save(); changed();
            return null;
        },
        moveBuild(name, dir) {
            const c = charData();
            if (!c || !c.builds[name]) return;
            const keys = Object.keys(c.builds);
            const i = keys.indexOf(name), j = i + (dir < 0 ? -1 : 1);
            if (j < 0 || j >= keys.length) return;
            [keys[i], keys[j]] = [keys[j], keys[i]];
            c.builds = Object.fromEntries(keys.map(k => [k, c.builds[k]]));
            save(); changed();
        },
        updateBuild(name, patch) {
            const b = getBuild(name);
            if (!b) return;
            for (const k of ['icon', 'color', 'hotkey']) if (k in patch) b[k] = patch[k];
            if ('useCrests' in patch) patch.parts = Object.assign({}, patch.parts, { crests: !!patch.useCrests });
            if (patch.parts) {
                if (!b.parts) b.parts = Object.fromEntries(PARTS.map(p => [p, partOn(b, p)]));
                for (const p of PARTS) if (p in patch.parts) b.parts[p] = !!patch.parts[p];
                delete b.useCrests;
            }
            save(); changed();
        },
        forgetLearned() {
            S().learned = { epPages: {}, epTemplate: null, polish: {}, polishTemplate: null, polishListRequest: null };
            save(); changed();
        },
        validName: name => NAME_RE.test(String(name || '').trim())
    };

    const gui = new (require('./lib/gui'))(core);
    function changed() { gui.changed(); }
    function openGui() { gui.openManager(); }

    // ------------------------------------------------------------------ имена (из датацентра, если доступно)
    async function lookupName(kind, id) {
        const key = `${kind}:${id}`;
        if (nameCache.has(key)) return nameCache.get(key);
        let name = String(id);
        try {
            if (typeof mod.queryData === 'function') {
                const path = kind === 'crest' ? '/StrSheet_Crest/String@id=?/' : '/StrSheet_SkillPolishingEffect/String@id=?/';
                const res = await Promise.race([mod.queryData(path, [id], false, false), sleep(1500).then(() => null)]);
                if (res && res.attributes && res.attributes.name) name = `${res.attributes.name} (${id})`;
            }
        } catch (_) { /* нет client interface — показываем id */ }
        nameCache.set(key, name);
        return name;
    }

    async function showBuild(name) {
        const b = getBuild(name);
        if (!b) return msg(T('Билд «{name}» не найден.', { name }));
        const m = buildMatches(b);
        const mark = v => v === null ? '?' : T(v ? 'совпадает' : 'отличается');
        msg(T('«{name}»: страница талантов {page} [{mark}]', { name, page: b.epPreset !== undefined ? b.epPreset + 1 : '—', mark: mark(m.ep) }));
        if (b.crests) {
            const names = await Promise.all(b.crests.map(id => lookupName('crest', id)));
            msg(T('Символы ({n}) [{mark}]: {list}', { n: b.crests.length, mark: mark(m.crests), list: names.join(', ') }));
        }
        if (b.polish) {
            const lines = await Promise.all(Object.entries(b.polish).map(async ([g, id]) => `${g}: ${await lookupName('polish', id)}`));
            msg(T('Улучшение умений [{mark}]: {list}', { mark: mark(m.polish), list: lines.join('; ') || '—' }));
        }
        reportUnknownPackets(name, b);
    }

    function status() {
        const c = charData();
        const builds = c ? Object.keys(c.builds) : [];
        msg(T('Персонаж: {char} | страница талантов: {page} | символов вкл.: {crests} | улучшений: {polish}', { char: charName() || '—', page: st.epPreset !== null ? st.epPreset + 1 : '?', crests: st.crestsKnown ? enabledCrests().length : '?', polish: st.polishKnown ? [...st.polish.values()].filter(Boolean).length : '?' }));
        const matching = builds.filter(n => {
            const m = buildMatches(c.builds[n]);
            return Object.values(m).every(v => v !== false) && Object.values(m).some(v => v === true);
        });
        msg(T('Билды: {list}', { list: builds.length ? builds.join(', ') : T('нет') }) + (matching.length ? T(' | сейчас надет: {list}', { list: matching.join(', ') }) : ''));
        msg(T('Выучено пакетов: страниц талантов {ep}, опций улучшения {polish}, запрос списка: {list}', { ep: Object.keys(L().epPages).length + (L().epTemplate ? T(' (+шаблон)') : ''), polish: Object.keys(L().polish).length + (L().polishTemplate ? T(' (+шаблон)') : ''), list: T(L().polishListRequest ? 'да' : 'нет') }));
    }

    function toggleDebug() {
        debug = !debug;
        if (debug && !sniffHook) {
            sniffHook = mod.hook('*', 'raw', { order: -1000, filter: { fake: null, modified: null, silenced: null } }, (code, data, incoming, fake) => {
                const name = mod.dispatch.protocolMap.code.get(code) || `#${code}`;
                if (incoming ? !DEBUG_INCOMING.test(name) : NOISY.has(name)) return;
                const body = data.slice(payloadOffset(code)).toString('hex');
                mod.log(`${incoming ? '<-' : '->'}${fake ? ' [fake]' : ''} ${name} (${data.length}b) ${body}`);
                if (!incoming && !fake) msg(`-> ${name} ${body.length > 48 ? body.slice(0, 48) + '…' : body}`);
            });
        } else if (!debug && sniffHook) {
            mod.unhook(sniffHook);
            sniffHook = null;
        }
        msg(T(debug ? 'Отладка включена: клиентские пакеты пишутся в чат и в лог toolbox.' : 'Отладка выключена.'));
    }

    function help() {
        msg(T('build save <имя> — сохранить текущие экипировку, символы, таланты и улучшения'));
        msg(T('build <имя> — переключиться (также: {list})', { list: S().shortcuts.join(', ') }));
        msg(T('build list | show <имя> | del <имя> | part <имя> equip|costume|talents|crests|polish on|off | gui | bar | lang ru|en | status | debug | forget | on | off'));
    }

    // ------------------------------------------------------------------ команды
    const handler = (sub, ...args) => {
        const a = (sub || '').toLowerCase();
        switch (a) {
            case '': case 'help': help(); status(); break;
            case 'save': saveBuild(args[0]); break;
            case 'load': case 'use': applyBuild(args[0]); break;
            case 'list': {
                const c = charData();
                msg(T('Билды {char}: {list}', { char: charName() || '', list: c && Object.keys(c.builds).length ? Object.keys(c.builds).join(', ') : T('нет') }));
                break;
            }
            case 'show': showBuild(args[0]); break;
            case 'del': case 'delete': {
                const c = charData();
                if (c && c.builds[args[0]]) { delete c.builds[args[0]]; save(); changed(); msg(T('Билд «{name}» удалён.', { name: args[0] })); }
                else msg(T('Нет такого билда.'));
                break;
            }
            case 'status': status(); break;
            case 'gui': case 'ui': openGui(); break;
            case 'bar': case 'панель': gui.toggleBar(); break;
            case 'lang': case 'language': case 'язык': {
                const lang = (args[0] || '').toLowerCase();
                if (!I18N.LANGUAGES[lang]) { msg(T('Пример: build lang en (языки: {list})', { list: Object.keys(I18N.LANGUAGES).join(', ') })); break; }
                S().language = lang;
                save(); changed();
                msg(T('Язык интерфейса: {lang}.', { lang: I18N.LANGUAGES[lang] }));
                break;
            }
            case 'part': {
                // build part <имя> <equip|talents|crests|polish> on|off
                const b = getBuild(args[0]);
                const map = { equip: 'equip', экип: 'equip', costume: 'costume', костюмы: 'costume', talents: 'talents', таланты: 'talents', crests: 'crests', glyphs: 'crests', символы: 'crests', polish: 'polish', улучшения: 'polish' };
                const part = map[(args[1] || '').toLowerCase()];
                if (!b || !part) { msg(T('Пример: build part tank equip off (части: equip, costume, talents, crests, polish)')); break; }
                core.updateBuild(args[0], { parts: { [part]: (args[2] || '').toLowerCase() !== 'off' } });
                msg(T('«{name}»: {part} {state}.', { name: args[0], part, state: T(partOn(b, part) ? 'вкл' : 'выкл') }));
                break;
            }
            case 'glyphs': {
                const b = getBuild(args[0]);
                if (!b) { msg(T('Нет такого билда.')); break; }
                core.updateBuild(args[0], { parts: { crests: (args[1] || '').toLowerCase() !== 'off' } });
                msg(T(partOn(b, 'crests') ? 'Символы для «{name}» переключаются.' : 'Символы для «{name}» не трогаются.', { name: args[0] }));
                break;
            }
            case 'debug': toggleDebug(); break;
            case 'forget':
                core.forgetLearned();
                msg(T('Выученные пакеты забыты. Переключите всё вручную один раз, чтобы мод выучил их заново.'));
                break;
            case 'on': S().enabled = true; save(); msg(T('Мод включён.')); break;
            case 'off': S().enabled = false; save(); msg(T('Мод выключен.')); break;
            default: applyBuild(sub); break;
        }
    };

    command.add(['build', 'билд'], handler);
    for (const shortcut of S().shortcuts || []) {
        try { command.add(shortcut, () => applyBuild(shortcut)); }
        catch (e) { mod.warn(T('Команда {cmd} уже занята другим модом — используйте "build {cmd}".', { cmd: shortcut })); }
    }

    // ------------------------------------------------------------------ hot-reload
    this.saveState = () => ({
        crests: [...st.crests], crestsKnown: st.crestsKnown, epPreset: st.epPreset, epUnlocked: st.epUnlocked,
        polish: [...st.polish], polishGroupOf: [...st.polishGroupOf], polishKnown: st.polishKnown
    });
    this.loadState = state => {
        if (!state) return;
        st.crests = new Map(state.crests); st.crestsKnown = state.crestsKnown;
        st.epPreset = state.epPreset; st.epUnlocked = state.epUnlocked;
        st.polish = new Map(state.polish); st.polishGroupOf = new Map(state.polishGroupOf); st.polishKnown = state.polishKnown;
    };
    // Команды и хуки toolbox снимает сам при выгрузке мода
    this.destructor = () => {
        if (sniffHook) { mod.unhook(sniffHook); sniffHook = null; }
        gui.destroy();
    };
};
