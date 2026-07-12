# 스마트 건설안전 운영 가이드

## 1. 운영 원칙

- Next.js 서버 한 대만 SQLite DB 파일을 연다.
- 팀원 PC는 브라우저와 HTTP API로만 접속한다.
- DB를 네트워크 공유 폴더에 두거나 Excel처럼 직접 열어 공동 편집하지 않는다.
- 외부 인터넷 router port forwarding은 설정하지 않는다.
- 이관, migration, 복구 전에는 반드시 backup을 만든다.

| 항목 | 운영 값 |
|---|---|
| 서버 PC 이름 | 미정 |
| 서버 IPv4 | 미정 |
| 사내 subnet | 미정 |
| 서비스 port | 3000 |
| 운영 DB | .env의 DATABASE_URL |
| 별도 backup 위치 | 미정 |
| 최초 관리자 | 미정 |

## 2. 최초 배포

    Set-Location D:\allside\smart-construction
    npm install
    Copy-Item .env.example .env
    npm run env:check
    npm run db:generate
    npm run db:deploy
    npm run build

.env의 DATABASE_URL은 server local disk의 file: URL이어야 한다.

    DATABASE_URL="file:./data/app.db"
    SESSION_COOKIE_SECURE="false"
    SESSION_TTL_HOURS="12"

## 3. 수동 production 실행·종료

운영자는 프로젝트 폴더에서 다음 파일을 더블클릭해 server를 실행한다.

    02-start-server.cmd

server를 사용하는 동안 열린 명령 창을 닫지 않는다. 종료할 때는 다음 파일을 더블클릭한다.

    03-stop-server.cmd

PowerShell에서 직접 실행해야 할 때는 다음 명령을 사용한다.

    powershell -ExecutionPolicy Bypass -File scripts/start-production.ps1 -Port 3000

이 script는 migration을 먼저 적용한 후 0.0.0.0:3000에서 production server를 실행한다. 이미 port를 사용 중이거나 production build가 없으면 중단한다.

다른 창에서 점검한다.

    powershell -ExecutionPolicy Bypass -File scripts/test-lan-readiness.ps1 -Port 3000

Ready가 true이고 TeamUrls에 사내 IPv4 URL이 표시되어야 한다.

수동으로 실행한 production server를 중지할 때는 포트와 명령줄을 확인하는 script를 사용한다.

    npm run ops:stop -- -Port 3000

프로세스가 응답하지 않을 때만 `-Force`를 추가한다. 다른 프로그램이 해당 포트를 사용하면 script가 중지하지 않고 오류를 표시한다.

## 4. 고정 IP

권장 순서는 공유기 또는 사내 DHCP 서버에서 server PC의 MAC 주소에 DHCP 예약을 설정하는 것이다. 사내 IT 담당자에게 server PC 이름, network adapter MAC, 현재 IPv4와 subnet prefix, 예약할 IPv4, gateway와 DNS를 전달한다.

Windows에 임의 static IP를 직접 넣기 전에 IP 중복과 사내 정책을 확인한다. 이 저장소는 network adapter 설정을 자동 변경하지 않는다.

## 5. Windows 방화벽

실제 사내 subnet으로 dry-run 한다.

    powershell -ExecutionPolicy Bypass -File scripts/configure-firewall.ps1 -Port 3000 -RemoteAddress 192.168.0.0/24

승인 후 관리자 PowerShell에서만 적용한다.

    powershell -ExecutionPolicy Bypass -File scripts/configure-firewall.ps1 -Port 3000 -RemoteAddress 192.168.0.0/24 -Apply

Public profile은 열지 않는다. LocalSubnet을 쓸 수 있지만 정확한 CIDR이 더 명확하다.

## 6. 자동 backup

서비스는 자동 시작하지 않고 `02-start-server.cmd`로 수동 실행한다. 매일 02:00 backup task 계획만 dry-run으로 확인한다. backup은 가능하면 운영 DB와 다른 disk를 지정한다.

    npm run ops:backup-task:plan -- -BackupTime 02:00 -BackupDirectory E:\SmartConstructionBackups

관리자 PowerShell에서 적용한다.

    npm run ops:backup-task:plan -- -BackupTime 02:00 -BackupDirectory E:\SmartConstructionBackups -Apply

등록되는 task는 `SmartConstruction-Backup` 하나이며 매일 지정 시각 SQLite online backup을 실행한다. 과거에 `SmartConstruction-App` 자동 시작 task가 등록되어 있으면 `-Apply` 실행 시 제거한다.

적용 후 task 상태를 확인한다.

    Get-ScheduledTask -TaskName SmartConstruction-Backup

## 7. 수동 backup

    powershell -ExecutionPolicy Bypass -File scripts/backup-database.ps1 -BackupDirectory E:\SmartConstructionBackups

결과 DB와 같은 이름의 .json metadata가 생긴다. metadata에는 SHA-256, 크기, quick_check 결과가 기록된다. 기본 보존 기간은 30일이며 smart-construction-*.db 패턴만 정리한다.

## 8. restore

restore는 server를 먼저 중지하고 확인 switch가 있어야 실행된다.

    npm run ops:stop -- -Port 3000
    Get-NetTCPConnection -LocalPort 3000 -State Listen

listener가 없어야 한다.

    powershell -ExecutionPolicy Bypass -File scripts/restore-database.ps1 -BackupFile E:\SmartConstructionBackups\smart-construction-YYYYMMDD-HHMMSS-fff.db -Port 3000 -ConfirmRestore

restore 순서:

1. backup 파일 quick_check
2. 현재 DB의 복구 직전 backup
3. 임시 DB에 backup 복제
4. WAL/SHM 정리
5. DB 교체
6. 복원 DB quick_check
7. 실패 시 직전 DB 되돌림

복구 후 `02-start-server.cmd`로 server를 다시 실행하고 health를 확인한다.

    powershell -ExecutionPolicy Bypass -File scripts/test-lan-readiness.ps1 -Port 3000

## 9. 기존 데이터 이관

### 9.1 기존 HTML localStorage

1. 실제 데이터를 사용하던 browser에서 Smart_Construction_App.html을 연다.
2. header의 이관 JSON 버튼을 누른다.
3. 내려받은 JSON 원본을 별도 보관한다.
4. 새 시스템에서 관리자로 로그인한다.
5. 설정 > 기존 데이터 이관에서 JSON을 선택한다.
6. 품목·현장·계약·공급자 신규/기존/오류 건수를 확인한다.
7. 검증 보고서 JSON을 내려받아 보관한다.
8. 운영 DB backup 후 확정 이관한다.

### 9.2 기존 계약 Excel

지원 확장자는 xlsx와 xlsm, 최대 크기는 5MB, 최대 데이터는 10,000행이다. 첫 20행 안에 header가 있어야 한다.

필수 열:

- 현장 또는 현장명
- 품목 또는 품목명
- 수량
- 시작일 또는 계약시작일
- 종료일 또는 계약종료일

선택 열:

- 매출단가 또는 판매단가
- 매입단가 또는 원가
- 단위

같은 품목의 단가·단위가 여러 행에서 다르면 첫 값을 사용하고 경고한다. 실제 업무 Excel 열이 다르면 확정하지 말고 mapping fixture를 먼저 추가한다.

### 9.3 이관 안전장치

- preview는 DB를 쓰지 않는다.
- 오류가 한 건이라도 있으면 commit할 수 없다.
- commit 직전 fingerprint를 다시 확인한다.
- 품목·현장·계약·공급자를 하나의 transaction으로 처리한다.
- 같은 fingerprint 재이관을 차단한다.
- 같은 레거시 계약 ID는 결정적 계약번호로 중복 생성하지 않는다.
- 행별 결과와 batch 이력을 DB·감사 로그에 남긴다.

## 10. 팀원 PC 인수

server PC가 아닌 같은 사내망 PC 두 대 이상에서 확인한다.

1. http://서버IPv4:3000 접속
2. 사용자별 로그인
3. 사용자 A가 test 메모 저장
4. 사용자 B 화면이 새로고침 없이 갱신
5. Excel export 내려받기
6. 거래명세표 A4/PDF 저장
7. logout과 재로그인

## 11. 거래명세표 수동 인수

- 시스템 기본이 수정·삭제되지 않고 복제본만 편집되는지 확인
- 관리자와 매니저가 같은 공용 템플릿을 보고, 조회 사용자는 저장·삭제할 수 없는지 확인
- 블록 이동·크기 조절이 A4 경계와 다른 블록에서 멈추는지 확인
- 폰트·크기·굵기·글자/배경/테두리색이 미리보기와 출력에 동일하게 반영되는지 확인
- 표 열 표시·순서·너비가 미리보기와 모든 출력 페이지에 동일하게 반영되는지 확인
- 제목, 발행일, 수신처
- 공급자 등록번호·상호·대표·주소·업태·종목·전화
- 필수 품명·금액 열과 선택한 나머지 열
- 공급가액 합계와 VAT 별도 문구
- 기본 양식 12행 및 사용자 양식의 표 높이·글자 크기에 따른 자동 page 분리
- 여러 현장의 새 page 시작
- A4 margin, font, 잘림 여부
- 템플릿 수정·삭제 후 기존 발행본 재출력이 발행 당시 배치와 색상을 유지하는지 확인
- 미리보기 후 다른 사용자가 템플릿을 수정하면 발행이 중단되고 새 미리보기를 요구하는지 확인

승인 결과를 IMPLEMENTATION_PLAN.md Phase 11 인수표에 기록한다.

## 12. 운영 점검 주기

매일: server 수동 실행 후 /api/health, 전일 backup과 metadata, backup task LastTaskResult

매주: backup quick_check, 남은 disk 용량, server log 오류

분기: 격리 restore 훈련, 사용자·권한 정리, Windows·Node update 후 전체 회귀 검증
