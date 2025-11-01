# Logic Explanation - Prompt Submission Flow

## 1. ROLE_ORDER และ Index Mapping

```
ROLE_ORDER = ["head", "torso", "legs", "pose", "background"]
Index:       0       1       2      3      4

- Index 0 = head (ส่วนที่ 1)
- Index 1 = torso (ส่วนที่ 2) 
- Index 2 = legs (ส่วนที่ 3)
- Index 3 = pose (ส่วนที่ 4)
- Index 4 = background (ส่วนที่ 5)
```

## 2. เริ่มต้น (Initial State)

เมื่อ player เข้าร่วม round ใหม่:
```javascript
entry.currentRoleIndex = 0
entry.prompts = {
  head: null,
  torso: null,
  legs: null,
  pose: null,
  background: null
}
```

## 3. Flow การส่ง Prompt

### ตัวอย่างที่ 1: ส่งส่วนที่ 1 (Head)

**ก่อนส่ง:**
- `currentRoleIndex = 0`
- Client แสดง: `ROLE_ORDER[0]` = `head` (ส่วนที่ 1)
- User พิมพ์ prompt สำหรับ head

**ตอนส่ง:**
```javascript
// ใน sessionStore.submitPrompt:
const roleId = ROLE_ORDER[entry.currentRoleIndex]; // ROLE_ORDER[0] = "head"
entry.prompts[roleId] = prompt; // เก็บ prompt ลง prompts["head"]
entry.currentRoleIndex += 1; // 0 -> 1
```

**หลังส่ง:**
- `currentRoleIndex = 1`
- Client แสดง: `ROLE_ORDER[1]` = `torso` (ส่วนที่ 2)
- `entry.prompts.head = "prompt ที่ user พิมพ์"`
- `entry.prompts.torso = null`

### ตัวอย่างที่ 2: ส่งส่วนที่ 2 (Torso)

**ก่อนส่ง:**
- `currentRoleIndex = 1`
- Client แสดง: `ROLE_ORDER[1]` = `torso` (ส่วนที่ 2)
- User พิมพ์ prompt สำหรับ torso

**ตอนส่ง:**
```javascript
// ใน sessionStore.submitPrompt:
const roleId = ROLE_ORDER[entry.currentRoleIndex]; // ROLE_ORDER[1] = "torso"
entry.prompts[roleId] = prompt; // เก็บ prompt ลง prompts["torso"]
entry.currentRoleIndex += 1; // 1 -> 2
```

**หลังส่ง:**
- `currentRoleIndex = 2`
- Client แสดง: `ROLE_ORDER[2]` = `legs` (ส่วนที่ 3)
- `entry.prompts.head = "prompt ส่วนที่ 1"`
- `entry.prompts.torso = "prompt ที่ user พิมพ์ (ส่วนที่ 2)"`
- `entry.prompts.legs = null`

## 4. ปัญหาที่อาจเกิด

### ปัญหา: ข้อมูลสลับกัน

**ถ้าเห็นว่า:**
- User พิมพ์ส่วนที่ 2 (torso)
- แต่ข้อมูลไปอยู่ในส่วนที่ 1 (head)

**สาเหตุที่เป็นไปได้:**
1. `currentRoleIndex` ไม่ตรงกับ UI ที่แสดง
2. SSE sync มา override state ผิด
3. Optimistic update ที่เหลืออยู่

### การแก้ไข:

ให้ตรวจสอบว่า:
1. `playerEntry.currentRoleIndex` ตรงกับ role ที่แสดงบน UI หรือไม่
2. เมื่อส่ง prompt ไปที่ server, server ใช้ `entry.currentRoleIndex` ที่ถูกต้องหรือไม่
3. Response จาก server มาด้วย `currentRoleIndex` ที่ถูกต้องหรือไม่

