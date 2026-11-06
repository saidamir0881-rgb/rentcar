# Rent Car - kunlik ijara sayti

Sayt: https://rent-car-tashkent-2026.sappycob2.chatgpt.site
Mahalliy server: npm.cmd start (PORT odatda 3007). Admin: /admin.

Katalog manbasi: https://crc.uz/category/auto/ . 2026-11-05 kuni 49 ta avtomobil, modeliga mos rasmlar, sinflar va kunlik UZS tariflari import qilindi. Tariflar manbada "dan boshlab" berilgan. Ular avtomatik yangilanmaydi. Olish va qaytarish sanasi orqali hisoblangan jami summa taxminiy; depozit, chegirma va mavjudlikni CRC tasdiqlaydi. Saytda ham bron so'rovi yuborish mumkin; operator admin panelda tasdiqlaydi yoki rad etadi. CRC tashqi havolasi ikkinchi variant sifatida saqlangan. To'lov olinmaydi.

Yil va yangi/ishlatilgan holati manbada yo'q bo'lsa null qoladi. Rasmlar modelga oid CRC katalog rasmlaridir, aniq mavjud avtomobilning bugungi holatini tasdiqlamaydi. Admin yangilagan tariflar alohida belgilanadi.

Ijara katalogi Supabase Storage ichidagi PRIVATE rentcar-catalog bucket / catalog.json obyektida saqlanadi. Server secret kaliti orqali o'qiydi; faqat tekshirilgan admin yozishi mumkin. Bu tuzilma tarif, rasm va manbada yo'q qiymatlarni eski 5 ta majburiy maydonli cars jadvaliga majburlamaydi. Eski cars jadvali va /cars API oldingi Postman mashqlari uchun saqlangan, sayt esa /api/rentals API dan foydalanadi.

GET /api/rentals - kunlik ijara katalogi.
GET /api/rentals/:id - bitta ijara avtomobili.
POST /api/rentals - admin qo'shadi.
PUT /api/rentals/:id - admin tahrirlaydi.
DELETE /api/rentals/:id - admin o'chiradi.

Admin oddiy login orqali kiradi. Avtomobil qo'shishda marka, model, kunlik narx (so'm), sinf va HTTPS rasm manzilini kiriting. Ma'lum bo'lsa yil va holatni ham to'ldiring. Eski admin hisobining paroli manba fayllarida saqlanmagan.

Foydalanuvchilar: Supabase Auth hamda yopiq userlar jadvali. Ro'yxatdan o'tish: ism, familiya, email, parol, tug'ilgan sana, shaxsiy pasport. Hisob ochish 18+, ammo provayderning avtomobil uchun yosh talabi alohida (CRC ma'lumotlarida odatda 23+). Tug'ilgan sana foydalanuvchi tomonidan kiritiladi, hujjat autentifikatsiyasi amalga oshirilmaydi.

Sozlamalar: SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, PORT. Parollar Supabase Auth da. Sessiyalar HttpOnly cookie orqali saqlanadi. Yangi bazada website-schema.sql orqali userlar jadvalini tayyorlang. Mazkur loyihada bu jadval mavjudligi tekshirildi.

Tekshirish: npm.cmd test. Hosting yig'ish: node rentcar-site/scripts/build.mjs. Rasmlar worker ichiga kiritiladi, tashqi rasm serveriga bog'lanmaydi. Admin kiritgan HTTPS rasm manzillari esa o'sha serverdan yuklanadi.

## Sayt ichida bronlash

Mahalliy bron formasi, kabinetdagi Bronlarim va admin paneldagi Bronlar bo?limi qo?shildi. Yangi SQL talab qilinmaydi. Batafsil: BOOKING-SETUP.md. CRC tashqi bandligi avtomatik sinxronlanmaydi; admin tasdiqdan oldin hamkor bilan tekshiradi.

## Email confirmation

Website registration automatically confirms the email on the server and immediately signs the user in. No confirmation email is sent. Passwords remain in Supabase Auth; private profiles remain in userlar. This is implemented in the website registration route using the server-only Auth admin API; the project-wide Supabase Auth setting is unchanged.
