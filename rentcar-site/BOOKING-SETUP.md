# Sayt ichida ijara so'rovlari

Foydalanuvchi avtomobil tafsilotidagi **Saytda bron qilish** formasidan foydalanadi. Tizimga kirish, to'ldirilgan profil va avtomobilning minimal yosh talabiga moslik kerak. Telefon, olish joyi va 1–365 kunlik sanalar kiritiladi. Mijoz yuborgan narx yoki tasdiqlangan holat qabul qilinmaydi: summa joriy katalogdan serverda hisoblanadi.

Yangi so'rov **Tasdiqlash kutilmoqda** holatida saqlanadi. Kabinetdagi **Bronlarim** orqali holat va operator izohi ko'rinadi; mijoz o'z kutilayotgan yoki tasdiqlangan so'rovini bekor qilishi mumkin.

Admin oddiy login orqali kiradi va **Bronlar** bo'limida buyurtmalarni ko'radi. Mavjudlik va yakuniy shartlar CRC bilan kelishilgach **Tasdiqlash**, aks holda **Rad etish** tanlanadi. Tasdiqlangan bronni ham bekor qilish mumkin. Yakuniy rad etilgan yoki bekor qilingan so'rov qayta tasdiqlanmaydi; yangi so'rov yuboriladi.

CRC katalogi, rasmlar va tashqi bronlash havolasi saqlangan. Saytning bronlari CRC tizimiga avtomatik yuborilmaydi; bu saytda to'lov olinmaydi. Mahalliy sana bandligi faqat ushbu saytda tasdiqlangan bronlarni tekshiradi. Hamkorning tashqi bandligini operator tekshiradi. Ko'rsatilgan summa taxminiy, depozit va qo'shimcha shartlar alohida kelishiladi.

## Saqlash va API

Yangi SQL bajarish shart emas. So'rovlar mavjud yopiq Supabase Storage `rentcar-catalog` bucket ichida `bookings/<uuid>.json` ko'rinishida saqlanadi. Mijozlar bu obyektlarga to'g'ridan-to'g'ri kira olmaydi. Server hisobni tekshiradi; pasport raqami bron nusxasiga ko'chirilmaydi.

- `POST /api/bookings`: `car_id`, `start_date`, `end_date`, `phone`, `pickup_location`, ixtiyoriy `notes`, UUID `idempotency_key`.
- `GET /api/bookings`: joriy mijozning bronlari.
- `POST /api/bookings/:uuid/cancel`: o'z bronini bekor qilish.
- `GET /api/admin/bookings`: admin uchun barcha bronlar.
- `PUT /api/admin/bookings/:uuid`: `status` (`confirmed`, `rejected`, `cancelled`) va ixtiyoriy `admin_note`.

Narx UZS/kun bo'yicha saqlanadi. Sana oralig'i [olish, qaytarish): qaytarish sanasi keyingi mijoz uchun bo'sh. Takroriy yuborish bir xil UUID va bir xil ma'lumot bilan bitta bronni qaytaradi; shu UUID boshqa ma'lumotga qayta ishlatilsa 409 bo'ladi.

Tasdiqlashda server har bir kun uchun `booking-locks/<car_id>/<date>.json` obyektini faqat yangi bo'lsa yaratadi. Shu saytdagi tasdiqlangan bronlar bir-birini qoplamaydi. Bitta bron holatini bir vaqtda yangilash `booking-operations/<uuid>.json` bilan cheklanadi. Tarmoqda noaniq xato bo'lsa, tasdiq saqlanmaganini tekshirmasdan kunlar bo'shatilmaydi.

Favqulodda jarayon uzilishi operatsiya qulfi yoki band kunni qoldirishi mumkin. Bunday holatda so'rov xavfsiz tarzda bloklanadi. Operator avval haqiqiy bron holatini va davom etayotgan operatsiya yo'qligini tekshirishi kerak; keyin faqat shu bronning `booking-operations/<uuid>.json` obyektini o'chirib, holat amalini qayta bajaradi. Kun qulflarini qo'lda ommaviy o'chirmang. Rad etish/bekor qilish faqat shu bron egallagan kunlarni bo'shatadi.

Tekshirish: `npm.cmd test`. `verify-booking-flow.mjs` haqiqiy bazada faqat vaqtinchalik sinov foydalanuvchilari va avtomobil bilan tekshiradi, so'ng ularni tozalaydi; email yubormaydi.
