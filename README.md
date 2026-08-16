# Event Post-Test & e-Certificate V1

Aplikasi web statis untuk event/workshop berulang: peserta scan QR, isi identitas, mengerjakan post-test, nilai dihitung otomatis di Supabase, lalu sertifikat PDF langsung dibuat di HP peserta.

## Fitur V1
- Multi-event dalam satu aplikasi dan satu project Supabase.
- ±100 peserta/event (dan dapat lebih banyak untuk skala ini).
- Bank soal dari file TXT/Notepad.
- Tipe soal: PG, Benar/Salah, Isian Singkat; semuanya auto-scoring.
- Soal acak per peserta dan pilihan jawaban dapat diacak di browser.
- Kunci jawaban tidak pernah dikirim ke browser peserta; scoring dilakukan oleh RPC Supabase.
- Admin mengubah nama event, workshop, penyelenggara, tempat, tanggal, passing grade, durasi, jumlah soal.
- Template sertifikat per event dapat di-upload PNG/JPG.
- Nama peserta, judul workshop, narasi, penandatangan, jabatan, tanda tangan, nomor sertifikat, dan QR validasi bersifat dinamis.
- Download sertifikat PDF.
- QR Code event dan QR verifikasi sertifikat.
- Dashboard peserta/hasil + export CSV.

## Template sertifikat bawaan
`assets/template_upj_blue.png` dibuat dari slide 1 file `Sertifikat_Workshop_Dosen.pptx`. Teks dan tanda tangan lama dihapus agar menjadi background/template bersih; logo dan ornamen slide tetap dipertahankan.

## Struktur file
- `index.html` : halaman peserta
- `admin.html` : dashboard admin
- `verify.html` : validasi sertifikat
- `js/config.js` : URL + publishable key Supabase
- `supabase/schema.sql` : tabel, RLS, RPC scoring, storage policy
- `sample/soal.txt` : contoh format bank soal
- `assets/template_upj_blue.png` : template slide 1

## Instalasi Supabase
1. Buka Supabase project yang akan digunakan.
2. Buka SQL Editor.
3. Jalankan seluruh isi `supabase/schema.sql`.
4. Buka Authentication > Users dan buat satu user admin menggunakan email/password.
5. Kembali ke SQL Editor dan jalankan:

```sql
insert into public.profiles(id,role)
select id,'admin' from auth.users where email='EMAIL_ADMIN_ANDA'
on conflict(id) do update set role='admin';
```

6. Pastikan `js/config.js` berisi Project URL tanpa `/rest/v1/` dan publishable key.

## Deploy GitHub Pages
Upload seluruh isi folder ini ke repository GitHub. Aktifkan Settings > Pages > Deploy from branch. Setelah URL Pages aktif, buka `admin.html` untuk membuat event.

## Membuat event
1. Login Admin.
2. Menu Event > Event Baru.
3. Isi kode event, judul, penyelenggara, lokasi, tanggal, jumlah soal, durasi, passing grade.
4. Aktifkan event.
5. Menu Soal > pilih event > upload `soal.txt` > Preview > Import.
6. Menu Sertifikat > pilih event > atur teks sertifikat, penandatangan, template dan tanda tangan > Save.
7. QR event otomatis muncul. Peserta scan QR tersebut.

## Format soal TXT
Setiap soal diawali `#SOAL`.

PG:
```text
#SOAL
TYPE=PG
CATEGORY=AI
PERTANYAAN=Apa kepanjangan dari AI?
A=Artificial Intelligence
B=Automatic Internet
C=Artificial Integration
D=Advanced Information
JAWABAN=A
BOBOT=1
```

Benar/Salah:
```text
#SOAL
TYPE=TF
PERTANYAAN=MySQL adalah DBMS.
JAWABAN=TRUE
BOBOT=1
```

Isian singkat dengan beberapa jawaban yang dianggap benar:
```text
#SOAL
TYPE=SHORT
PERTANYAAN=Apa kepanjangan DBMS?
JAWABAN=Database Management System|DBMS
BOBOT=1
```

## Placeholder narasi sertifikat
- `{WORKSHOP}` = judul workshop
- `{ORGANIZER}` = penyelenggara
- `{LOCATION}` = lokasi
- `{DATE}` = tanggal event

Nama peserta selalu diambil dari form peserta.

## Template yang berbeda per event
Upload background sertifikat PNG/JPG pada menu Sertifikat. Secara default posisi teks mengikuti template slide 1. Bila desain baru memiliki posisi berbeda, gunakan `Layout JSON` untuk mengubah koordinat elemen tanpa mengubah program.

## Catatan keamanan
Kunci jawaban berada di tabel Supabase yang tidak dapat dibaca anon. Browser hanya menerima teks soal dan opsi, sedangkan perhitungan nilai dilakukan di fungsi `submit_test()` berstatus `security definer`.
