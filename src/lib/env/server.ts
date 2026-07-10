import "server-only";

import { parseServerEnv } from "@/lib/env/schema";

export const serverEnv = parseServerEnv(process.env);
