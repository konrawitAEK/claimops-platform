# claimops-platform (ฉบับภาษาไทย)

> ฉบับภาษาไทยไว้อ่านประกอบ ฉบับหลักคือ [README.md](README.md)

ระบบยื่นเคลมและตรวจสอบเคลมประกันรถยนต์ (MOTOR) และทรัพย์สิน (PROPERTY) ของ 6 ประเทศใน APAC
- **ลูกค้า (Claimant):** ยื่นเคลม ติดตามสถานะ ตอบคำถามที่เจ้าหน้าที่ขอเพิ่ม และดูผลการตัดสิน
- **เจ้าหน้าที่ (Staff):** รับงาน ขอข้อมูลเพิ่ม และตัดสินว่าจะ settle (จ่าย) หรือ reject (ปฏิเสธ) รวมถึงดูยอดความเสี่ยงและผลงานของทีม

ระบบเป็น Spring Boot service เดียว (modular monolith) ใช้ PostgreSQL กับ Kafka และหน้าเว็บเป็น Angular

## รันทั้งระบบ

ต้องมี Docker และรันทุกคำสั่งที่โฟลเดอร์หลักของโปรเจกต์

```bash
docker compose up --build -d
```

| บริการ | ที่อยู่ |
|---|---|
| หน้าเว็บ | http://localhost:4200 ใช้แถบด้านบนสลับระหว่าง Claimant กับ Staff และเลือกผู้ใช้กับประเทศ |
| Backend | http://localhost:8080 (เช็กสถานะที่ `/actuator/health`) |
| เอกสาร API (Swagger) | http://localhost:8080/swagger-ui.html |
| PostgreSQL | `localhost:5432` (ชื่อ database, user และ password เป็น `claimops` ทั้งหมด) |
| Kafka | `localhost:9092` |

| ต้องการ | คำสั่ง |
|---|---|
| ดูสถานะ container | `docker compose ps` |
| ดู log ของ backend | `docker compose logs -f backend` |
| แก้โค้ดแล้ว build ใหม่เฉพาะ service | `docker compose up -d --build backend` (หรือ `frontend`) |
| หยุดระบบ แต่เก็บข้อมูลไว้ | `docker compose down` |

## ล้างฐานข้อมูล

**ล้างข้อมูลทั้งหมด โดยไม่ต้องหยุดระบบ:** เลขเคลมเริ่มนับใหม่ที่ 000001

```bash
docker compose exec postgres psql -U claimops -c "TRUNCATE claims, info_requests, liability_exposures, claim_audit_log, processed_events; ALTER SEQUENCE claim_number_seq RESTART;"
```

**ล้างทุกอย่างตั้งแต่ต้น:** ลบ volume ของ Postgres แล้ว Flyway จะสร้างตารางใหม่ และ Kafka จะเริ่มว่าง ใช้ตอนที่แก้ไฟล์ migration เดิม

```bash
docker compose down -v && docker compose up --build -d
```

## รันบางส่วนในเครื่อง (ตอนพัฒนา)

```bash
docker compose up -d postgres kafka
```

**Backend:** ต้องใช้ JDK 21 ถ้า container ของ backend รันอยู่ ให้หยุดก่อนด้วย `docker compose stop backend`

```bash
cd backend && ./mvnw spring-boot:run
```

**Frontend:** ต้องใช้ Node 22.22.3 ขึ้นไป ถ้า container ของ frontend รันอยู่ ให้หยุดก่อนด้วย `docker compose stop frontend`

```bash
cd frontend && npm install && npm start
```

## ดูข้อมูลข้างใน

```bash
docker compose exec postgres psql -U claimops
```

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic chubb.claims.events --from-beginning
```

## เทสต์

```bash
cd backend && ./mvnw test
```

Unit test มี 15 ข้อ ใช้แค่ JDK 21 ไม่ต้องเปิด Docker, ฐานข้อมูล หรือ Kafka

| ไฟล์ | จำนวน | ทดสอบอะไร |
|---|---|---|
| `ClaimTest` | 7 | flow ปกติตั้งแต่ยื่นจน settle, settle เคลมที่ยัง `SUBMITTED` ไม่ได้, เคลมที่ `REJECTED` แล้วแก้ไม่ได้, เจ้าหน้าที่อีกคนแย่งงานที่รอลูกค้าตอบไม่ได้ (บั๊กที่เคยเจอ), คนที่รับงานเท่านั้นตัดสินได้, settle ห้ามเกินยอดที่ขอ, สกุลเงินต้องเป็นของประเทศนั้นหรือ USD |
| `ClaimServiceTest` (Mockito) | 2 | รับงานพร้อมกัน คนที่ช้ากว่าแพ้และไม่มี event ออกไป / ยื่นเคลมแล้วส่ง `CLAIM_SUBMITTED` |
| `StaffClaimControllerTest` (`@WebMvcTest`) | 2 | ชนกันจาก optimistic lock ได้ 409 / ลูกค้าเรียก API ของเจ้าหน้าที่ได้ 403 |
| `ExposureProjectorTest` | 4 | ยอดเพิ่มตอนยื่นเคลม, ลดตอน settle และตอน reject, event ซ้ำถูกข้าม |

Build frontend:

```bash
cd frontend && npm run build
```

ถ้า Node ในเครื่องเก่ากว่า 22.22.3 ให้ build ใน container แทน:

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:22.23-alpine sh -c "npm ci && npm run build"
```

## ใส่ตัวตนตอนเรียก API

ระบบนี้ยังไม่มีการ login จริง ทุก request ต้องส่ง header 2 ตัว และ backend เชื่อค่าที่ส่งมาเลย

| Header | ค่า | ตัวอย่าง |
|---|---|---|
| `X-User-Role` | `CLAIMANT` หรือ `STAFF` เท่านั้น ถ้าใส่ค่าอื่นได้ 401 | `STAFF` |
| `X-User-Name` | ชื่ออะไรก็ได้ ไม่เกิน 100 ตัวอักษร | `bob` |

ชื่อ demo ที่ใช้ในหน้าเว็บ (`frontend/src/app/core/labels.ts`):
- **ลูกค้า:** `alice`, `ben`, `chloe`
- **เจ้าหน้าที่:** `bob`, `carol`, `dan`

ใน Swagger ให้กด **Authorize** แล้วใส่ทั้งสองค่า จากนั้นเรียก API ได้ทุกตัว

ชื่อมีผลกับสิทธิ์:
- ลูกค้าเห็นเฉพาะเคลมที่ยื่นด้วยชื่อตัวเอง ถ้าใช้ชื่ออื่นได้ 404
- ขอข้อมูลเพิ่ม, settle และ reject ต้องใช้ชื่อเดียวกับคนที่รับงานไว้ ถ้าไม่ตรงได้ 403

## API

| Method | Path | ใครเรียกได้ | ทำอะไร |
|---|---|---|---|
| POST | `/api/claimant/claims` | ลูกค้า | ยื่นเคลม `currency` ไม่ใส่ก็ได้ (ค่าเริ่มต้นเป็นสกุลเงินท้องถิ่น) หรือใส่ `USD` ส่วน `incidentDetails` ต้องมี `licensePlate` กับ `vehicleModel` สำหรับ MOTOR หรือ `propertyAddress` กับ `damageCategory` สำหรับ PROPERTY |
| GET | `/api/claimant/claims` | ลูกค้า | รายการเคลมของตัวเอง |
| GET | `/api/claimant/claims/by-number/{claimNumber}` | ลูกค้า | ค้นเคลมด้วยเลขเคลม (เฉพาะของตัวเอง) |
| GET | `/api/claimant/claims/{id}` | ลูกค้า | รายละเอียดเคลม |
| POST | `/api/claimant/claims/{id}/info-responses` | ลูกค้า | ตอบคำถามที่เจ้าหน้าที่ขอ |
| GET | `/api/staff/claims?status=&market=&claimType=&assignedTo=me` | เจ้าหน้าที่ | คิวงาน เรียงจากเก่าสุด |
| GET | `/api/staff/claims/{id}` | เจ้าหน้าที่ | รายละเอียดเคลม |
| POST | `/api/staff/claims/{id}/pickup` | เจ้าหน้าที่ | รับงาน ถ้ามีคนรับไปก่อนได้ 409 |
| POST | `/api/staff/claims/{id}/info-requests` | คนที่รับงาน | ส่งคำถามไปหาลูกค้า |
| POST | `/api/staff/claims/{id}/settlement` | คนที่รับงาน | settle ยอดต้องไม่เกินที่ลูกค้าขอ |
| POST | `/api/staff/claims/{id}/rejection` | คนที่รับงาน | ปฏิเสธเคลม ต้องใส่เหตุผล |
| GET | `/api/staff/dashboard` | เจ้าหน้าที่ | ยอด exposure, ปริมาณงานของทีม และผลงานรายคน |
| GET | `/api/staff/claims/{id}/audit` | เจ้าหน้าที่ | ประวัติการเปลี่ยนแปลงของเคลม สร้างจาก event ใน Kafka |

## โครงสร้าง frontend

ทุก component มีโฟลเดอร์ของตัวเอง ข้างในมี `<ชื่อ>.ts`, `<ชื่อ>.html` และ `<ชื่อ>.scss`

| โฟลเดอร์ | มีอะไร |
|---|---|
| `components/` | component ที่ใช้ร่วมกัน: `app-layout/` (แถบด้านบนที่สลับ role), `alert/`, `status-chip/` |
| `core/` | `identity.interceptor.ts` (ใส่ header ตัวตน), `guards.ts` (`roleGuard`), API URL, ข้อความ error, labels |
| `utils/` | ฟังก์ชันช่วย: `format.util.ts` (จัดรูปเงิน วันที่ และระยะเวลา), `text.util.ts`, `claim.util.ts`, `policy.util.ts` |
| `models/` | type ของข้อมูล ตรงกับ DTO ฝั่ง backend |
| `services/` | `session`, `claimant` และ `staff` |
| `pages/` | แยกโฟลเดอร์ตาม feature แต่ละ feature มีไฟล์ `<feature>.routes.ts` ของตัวเอง และโหลดแบบ lazy: `claimant/` (submit-claim, track-claim) กับ `staff/` (staff-workspace) component ที่ใช้เฉพาะหน้านั้นอยู่ใน `<หน้า>/components/<ชื่อ>/` |
