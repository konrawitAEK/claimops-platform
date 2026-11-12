# claimops-platform (ฉบับภาษาไทย)

ระบบยื่นเคลมและตรวจสอบเคลมประกันรถยนต์และทรัพย์สิน สำหรับ 6 ประเทศใน APAC
- **ลูกค้า (Claimant):** ยื่นเคลม ติดตามสถานะ และตอบคำถามที่เจ้าหน้าที่ขอเพิ่ม
- **เจ้าหน้าที่ (Staff):** รับงาน ขอข้อมูลเพิ่ม แล้วตัดสินให้จ่ายเคลม (settle) หรือปฏิเสธ (reject)

ระบบเป็น Spring Boot แบบ modular monolith ใช้ PostgreSQL และ Kafka

> ฉบับภาษาอังกฤษคือ [README.md](README.md) ใช้ส่งกรรมการ ไฟล์นี้มีไว้อ่านเตรียมตัว

## วิธีรัน

ต้องมี Docker

```bash
docker compose up --build
```

| บริการ | ที่อยู่ |
|---|---|
| Backend | http://localhost:8080 (เช็กสถานะที่ `/actuator/health`) |
| PostgreSQL | `localhost:5432` (ชื่อ database, user และ password เป็น `claimops` ทั้งหมด) |
| Kafka | `localhost:9092` |

ถ้าต้องการล้างข้อมูลทั้งหมด ให้รัน `docker compose down -v`

## วิธีรันเทสต์

```bash
cd backend && ./mvnw test
```

ใช้แค่ JDK 21 ไม่ต้องเปิด Docker, ฐานข้อมูล หรือ Kafka

| ไฟล์เทสต์ | สิ่งที่พิสูจน์ |
|---|---|
| `ClaimTest` (7) | flow ปกติตั้งแต่ยื่นจน settle, settle เคลมที่ยัง `SUBMITTED` หรือแก้เคลมที่ `REJECTED` แล้วไม่ได้, เจ้าหน้าที่อีกคนแย่งงานที่รอลูกค้าตอบไม่ได้ (บั๊กที่เคยเจอ), คนที่รับงานเท่านั้นตัดสินได้, settle ห้ามเกินยอดที่ขอ, สกุลเงินต้องเป็นของประเทศนั้นหรือ USD |
| `ClaimServiceTest` (2, Mockito) | เจ้าหน้าที่ 2 คนกดรับงานพร้อมกัน คนที่ช้ากว่าได้ `ObjectOptimisticLockingFailureException` และระบบไม่ส่ง event / ยื่นเคลมแล้วมี `CLAIM_SUBMITTED` |
| `StaffClaimControllerTest` (2, `@WebMvcTest`) | ความผิดพลาดจาก optimistic lock กลายเป็น **409** / ลูกค้าเรียก API ของเจ้าหน้าที่ได้ 403 |
| `ExposureProjectorTest` (4) | ยอด exposure เพิ่มตอนยื่นเคลม และลดตอน settle หรือ reject / ถ้า `eventId` เดิมถูกส่งซ้ำ ระบบไม่นับซ้ำ |

## API

ทุก request ต้องมี header 2 ตัว:
- `X-User-Role`: `CLAIMANT` หรือ `STAFF`
- `X-User-Name`: ชื่อผู้ใช้

| Method | Path | ใครเรียกได้ | ทำอะไร |
|---|---|---|---|
| POST | `/api/claimant/claims` | ลูกค้า | ยื่นเคลม `currency` ไม่ใส่ก็ได้ ถ้าไม่ใส่จะใช้สกุลเงินท้องถิ่น หรือใส่ `USD` |
| GET | `/api/claimant/claims` | ลูกค้า | ดูรายการเคลมของตัวเอง |
| GET | `/api/claimant/claims/{id}` | ลูกค้า | ดูรายละเอียดเคลม รวมคำถามที่เจ้าหน้าที่ส่งมา |
| POST | `/api/claimant/claims/{id}/info-responses` | ลูกค้า | ตอบคำถามที่เจ้าหน้าที่ขอ |
| GET | `/api/staff/claims` | เจ้าหน้าที่ | คิวงาน กรองตามสถานะ ประเทศ ประเภท หรือ `assignedTo=me` ได้ |
| POST | `/api/staff/claims/{id}/pickup` | เจ้าหน้าที่ | รับงาน ถ้ามีคนรับไปก่อนจะได้ 409 |
| POST | `/api/staff/claims/{id}/info-requests` | คนที่รับงาน | ส่งคำถามไปหาลูกค้า |
| POST | `/api/staff/claims/{id}/settlement` | คนที่รับงาน | settle เคลม ยอดต้องไม่เกินที่ลูกค้าขอ |
| POST | `/api/staff/claims/{id}/rejection` | คนที่รับงาน | ปฏิเสธเคลม ต้องใส่เหตุผล |
| GET | `/api/staff/dashboard` | เจ้าหน้าที่ | ยอด exposure แยกตามประเทศ ประเภท และสกุลเงิน กับปริมาณงานของทีม |
| GET | `/api/staff/claims/{id}/audit` | เจ้าหน้าที่ | ประวัติการเปลี่ยนแปลงของเคลม สร้างจาก event ใน Kafka |
