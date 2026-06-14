# Investment Forecast – Sync template for two phones

Тази версия позволява синхронизация между два телефона чрез Firebase Firestore.

## Стъпки за настройка
1. Създай Firebase проект.
2. Включи Authentication -> Anonymous.
3. Включи Firestore Database.
4. Попълни `config.js` с твоя Firebase config.
5. Качи файловете в GitHub Pages.
6. На двата телефона отвори приложението и въведи еднакъв **Portfolio ID** от бутона **Sync**.

## Как работи
- Ако два телефона имат един и същи Portfolio ID, промените по количество/цена се синхронизират.
- Gold и Silver: количество в грамове, цена в €/тр. унция.
