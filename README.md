# Rent Car

Kunlik avtomobil ijarasi sayti: 49 ta CRC katalog avtomobili, modelga mos rasmlar, UZS/kun tariflari, foydalanuvchi kabineti va admin panel.

## Ishga tushirish

Node.js 22.13+ va Supabase loyihasi kerak.

1. ".env.example" faylidan ".env" yarating, Supabase URL, publishable key, server secret key va portni kiriting.
2. Yangi bazada SQL Editor orqali "schema.sql" va "website-schema.sql" ni bajaring. Mavjud bazada jadval yaratish skriptlarini qayta bajarmang.
3. Terminalda "npm install" va "npm start" ni ishga tushiring. Windows PowerShell uchun "npm.cmd install" / "npm.cmd start" ishlatilishi mumkin.
4. Masalan PORT=3007 bo'lsa, http://localhost:3007 ni oching. Admin sahifa: /admin.

Server kaliti faqat serverda qoladi. Ro'yxatdan o'tishda email tasdiqlash xati yuborilmaydi; hisob avtomatik tasdiqlanib, foydalanuvchi darhol kiradi. Profilga ism, familiya, tug'ilgan sana va pasport yoziladi. Hisob ochish 18+, ijara yoshi esa avtomobil talabiga bog'liq. Parollar Supabase Auth tomonidan saqlanadi.

## Katalog va bronlar

Saytning ijara katalogi Supabase Storage ichidagi yopiq "rentcar-catalog" bucketning "catalog.json" obyektidan o'qiladi. Boshlang'ich katalog manbasi "rentcar-site/worker/rental-catalog.json" da bor; yangi Supabase loyiha uchun shu faylni private bucketga yuklang. Model rasmlari sayt bilan birga saqlanadi.

Yangi so'rov kutilayotgan holatda saqlanadi. Mijoz kabinetda ko'radi yoki bekor qiladi. Admin Bronlar bo'limida tasdiqlaydi/rad etadi. Bronlar private Storage'da saqlanadi; ushbu saytdagi tasdiqlangan sanalar qoplanishiga yo'l qo'yilmaydi. Tashqi CRC bandligi operator tomonidan tekshiriladi, avtomatik sinxronlash va onlayn to'lov mavjud emas.

Admin ruxsatini berish bo'yicha SQL "website-schema.sql" oxirida bor. Admin paroli va haqiqiy .env ushbu repozitoriyga kiritilmagan.

## Tekshirish

"npm test" - API, ruxsatlar, ro'yxatdan o'tish, bron va bir vaqtdagi so'rovlar testlari.

"node rentcar-site/scripts/build.mjs" - hosting uchun Worker artefakti.

## API

- /api/auth/register, /api/auth/login, /api/auth/logout
- /api/me
- /api/rentals va /api/rentals/:id
- /api/bookings va /api/bookings/:id/cancel
- /api/admin/bookings va /api/admin/bookings/:id
- /api/admin/users

Eski /cars API va Postman collection mashqlar uchun saqlangan. POST/PUT/DELETE uchun admin kirishi talab etiladi.

Batafsil: [RENTCAR-SETUP.md](RENTCAR-SETUP.md), [BOOKING-SETUP.md](BOOKING-SETUP.md).

Katalog manbasi: https://crc.uz/category/auto/ . Tariflar 2026-11-05 kuni olingan va avtomatik yangilanmaydi.
