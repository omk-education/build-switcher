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

    // Вызывать помощника активного билда при входе в игру
    summonOnLogin: true,

    // Глобальные горячие клавиши билдов (только TeraToolbox.exe)
    hotkeysEnabled: true,

    // Дублировать результат переключения из окна в чат
    chatReports: false,

    // Окна мода (только TeraToolbox.exe)
    gui: {
        // панель кнопок поверх игры
        barOnLogin: true,     // показывать при входе в игру
        barOnTop: true,       // поверх всех окон (игра — «Окно» или «Окно без рамки»)
        barNoFocus: true,     // не забирать фокус у игры при нажатии
        barLocked: false,     // закрепить панель: перетаскивание отключено
        hideUnfocused: false, // прятать панель, когда окно игры неактивно
        opacity: 100,         // непрозрачность, %
        idleOpacity: 100,     // непрозрачность, когда курсор не над панелью, %
        iconSize: 56,         // размер кнопок, px
        labels: true,         // подписи под кнопками
        layout: 'row',        // 'row' — в строку, 'column' — в столбец
        buttonBg: true,       // фон (плитка) под иконками
        buttonBgColor: '',    // цвет фона кнопок: '' — по теме, иначе #rrggbb
        buttonBgOpacity: 100, // непрозрачность фона кнопок, %
        buttonBorder: true,   // рамка кнопок
        transparentBg: false, // прозрачная панель: над игрой видны только кнопки
        barPosition: null,    // [x, y] — запоминается автоматически
        // окно управления
        managerOnLogin: false,
        managerOnTop: false,
        position: null,
        size: null,
        // общее
        zoom: 100,            // масштаб интерфейса, %
        theme: 'tera',        // tera | graphite | crimson | emerald | light
        toastSeconds: 8,      // сколько секунд показывать результат (0 — не скрывать)
        confirmDelete: true   // подтверждать удаление и перезапись
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
    // 4.0: одно окно с компактным режимом разделено на панель кнопок и окно управления
    const oldGui = (settings && settings.gui) || {};
    if (oldGui.autoOpen !== undefined && oldGui.barOnLogin === undefined) result.gui.barOnLogin = !!oldGui.autoOpen;
    if (oldGui.alwaysOnTop !== undefined && oldGui.barOnTop === undefined) result.gui.barOnTop = !!oldGui.alwaysOnTop;
    for (const k of ['compactSize', 'compact', 'autoHideBar', 'autoOpen', 'alwaysOnTop']) delete result.gui[k];
    // 4.1: роль в подборе подземелий убрана (сервер её не принимает)
    for (const c of Object.values(result.characters || {})) for (const b of Object.values((c && c.builds) || {})) delete b.role;
    return result;
};
