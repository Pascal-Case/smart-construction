# 스마트 건설안전 매출·청구 관리

사내 Windows PC에서 실행하고 팀원이 브라우저로 함께 사용하는 현장별 매출·청구 관리 시스템입니다.

Phase 1~11 기능 구현과 자동 검증을 완료했으며 실제 서버 PC·팀원 PC 인수 항목은 운영 가이드를 따릅니다.

## 기술 구성

- Next.js 16 App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui
- Prisma ORM, SQLite WAL
- Vitest, ExcelJS
- Server-Sent Events 실시간 동기화

## 실행 준비

Node.js 20.19 이상이 필요합니다. 현재 프로젝트는 npm을 기준으로 관리합니다.

```powershell
npm install
Copy-Item .env.example .env
npm run env:check
npm run db:generate
npm run db:deploy
```

`.env`의 `DATABASE_URL`은 SQLite `file:` URL이어야 합니다. DB 파일을 네트워크 공유 폴더에 두지 마세요.

## 개발 실행

현재 PC에서만 접속:

```powershell
npm run dev
```

사내 네트워크에서 접속:

```powershell
npm run dev:lan
```

다른 PC에서는 `http://서버PC-IP:3000`으로 접속합니다. Windows 방화벽 인바운드 규칙은 운영 전 별도로 제한 설정합니다.

## 검증

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

DB 연결 상태는 실행 후 `/api/health`에서 확인할 수 있습니다.

## 운영 실행

비개발자 운영자는 프로젝트 폴더의 `02-start-server.cmd`를 더블클릭해 server를 시작하고, `03-stop-server.cmd`로 종료합니다. 서비스 자동 시작은 사용하지 않습니다.

PowerShell에서 직접 실행할 때는 다음 명령을 사용합니다.

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File scripts/start-production.ps1
```

운영 DB 마이그레이션은 애플리케이션 시작 전에 다음 명령으로 적용합니다.

```powershell
npm run db:deploy
```

## 참고 문서

- `IMPLEMENTATION_PLAN.md`: 전체 단계와 업무 규칙
- `Smart_Construction_App.html`: 기존 화면 초안
- OPERATIONS_GUIDE.md: 배포, LAN, 수동 server 운영, backup·restore, 이관
- USER_GUIDE.md: 담당자용 화면 사용 안내

## 라이선스

이 프로젝트는 [MIT License](./LICENSE)로 배포됩니다.
