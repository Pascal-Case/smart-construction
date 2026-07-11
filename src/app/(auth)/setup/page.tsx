import { HardHat } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SetupForm } from "@/components/auth/setup-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasAnyUser } from "@/lib/auth/user-service";

export default async function SetupPage() {
  await connection();
  if (await hasAnyUser()) redirect("/login");
  return <main className="relative flex min-h-svh items-center justify-center bg-muted p-4"><div className="absolute top-4 right-4"><ThemeToggle /></div><Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-teal-700 text-white"><HardHat /></span><CardTitle className="text-2xl">최초 관리자 설정</CardTitle><CardDescription>첫 계정은 ADMIN 권한으로 생성되며 이후 사용자 관리를 담당합니다.</CardDescription></CardHeader><CardContent><SetupForm /></CardContent></Card></main>;
}
