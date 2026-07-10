import "server-only";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env/server";

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
  prismaReady?: Promise<void>;
};

const prismaGlobal = globalThis as PrismaGlobal;

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: serverEnv.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export const prisma = prismaGlobal.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.prisma = prisma;
}

export function ensureDatabaseReady() {
  prismaGlobal.prismaReady ??= (async () => {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 5000");
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  })();

  return prismaGlobal.prismaReady;
}
