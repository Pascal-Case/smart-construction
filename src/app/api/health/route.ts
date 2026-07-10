import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await ensureDatabaseReady();
    await prisma.$queryRawUnsafe("SELECT 1 AS healthy");

    return Response.json(
      {
        status: "ok",
        database: "connected",
        checkedAt,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Health check failed", error);

    return Response.json(
      {
        status: "error",
        database: "unavailable",
        checkedAt,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
