'use strict';

const DefaultSettings = {
    enabled: true,

    // Язык интерфейса и сообщений: 'ru' (базовый) или 'en'
    language: 'ru',

    // Пауза между отправкой пакетов, мс (не ставьте меньше 200)
    delay: 400,

    // Запрет переключения в бою
    blockInCombat: true,

    // Дополнительные короткие команды: /8 tank, /8 dd  ->  /8 build tank, /8 build dd
    shortcuts: ['tank', 'dd'],

    // Действие, если открыто окно взаимодействия (NPC, банк, торговля…), а символы нужно сменить:
    //   'single' — ставить символы по одному (сервер так разрешает), 'skip' — не трогать символы, 'abort' — не переключать билд
    crestsWhenBusy: 'single',

    // Глобальные горячие клавиши билдов (только TeraToolbox.exe)
    hotkeysEnabled: true,

    // Дублировать результат переключения из окна в чат
    chatReports: false,

    // Окно мода (только TeraToolbox.exe)
    gui: {
        autoOpen: true,       // открывать окно при входе в игру
        alwaysOnTop: true,    // поверх всех окон (игра — «Окно» или «Окно без рамки»)
        compact: false,       // компактный режим: только кнопки билдов
        opacity: 100,         // непрозрачность окна, %
        idleOpacity: 100,     // непрозрачность, когда курсор не над окном, %
        zoom: 100,            // масштаб интерфейса, %
        iconSize: 56,         // размер кнопок в компактном режиме, px
        labels: true,         // подписи под кнопками в компактном режиме
        layout: 'row',        // компактный режим: 'row' — в строку, 'column' — в столбец
        autoHideBar: true,    // компактный режим: заголовок только при наведении
        buttonBg: true,       // компактный режим: фон (плитка) под иконками кнопок
        transparentBg: false, // компактный режим: прозрачное окно — над игрой видны только кнопки
        theme: 'tera',        // tera | graphite | crimson | emerald | light
        toastSeconds: 8,      // сколько секунд показывать результат (0 — не скрывать)
        confirmDelete: true,  // подтверждать удаление и перезапись
        position: null,       // [x, y] — запоминается автоматически
        size: null            // [ширина, высота] обычного режима
    },

    // Выученные пакеты (заполняются автоматически, руками не трогать)
    learned: {
        epPages: {},        // номер страницы талантов -> { off, hex }
        epTemplate: null,   // { off, hex, delta } — шаблон, если пакет = uint32 номер страницы
        polish: {},         // id опции улучшения -> { off, hex }
        polishTemplate: null, // { off, hex, idOff, groupOff, group }
        polishListRequest: null // { off, hex } — запрос списка улучшений
    },

    // Свои иконки: id -> { name, svg, tint } (tint — перекрашивать в цвет билда)
    customIcons: {},

    // Сохранённые билды по персонажам
    characters: {}
};

const clone = o => JSON.parse(JSON.stringify(o));

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined || from_ver === null)
        return Object.assign(clone(DefaultSettings), settings || {});

    if (from_ver === to_ver)
        return settings;

    // Переносим существующие ключи поверх значений по умолчанию
    const result = clone(DefaultSettings);
    for (const key of Object.keys(settings || {}))
        result[key] = settings[key];
    result.learned = Object.assign(clone(DefaultSettings.learned), (settings && settings.learned) || {});
    result.gui = Object.assign(clone(DefaultSettings.gui), (settings && settings.gui) || {});
    delete result.panel; // кнопки VIP-панели убраны в 2.0
    delete result.gui.compactSize;
    return result;
};
