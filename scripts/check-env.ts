import "dotenv/config";

import { parseServerEnv } from "../src/lib/env/schema";

parseServerEnv(process.env);

console.log("환경변수 검증 완료: SQLite DATABASE_URL이 설정되어 있습니다.");
