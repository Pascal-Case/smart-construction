import { HardHat } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/auth/user-service";

export default async function LoginPage() {
  await connection();
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  return <AuthFrame title="로그인" description="발급받은 사내 계정으로 로그인하세요."><LoginForm /></AuthFrame>;
}

function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="relative flex min-h-svh items-center justify-center bg-muted p-4"><div className="absolute top-4 right-4"><ThemeToggle /></div><Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-teal-700 text-white"><HardHat /></span><CardTitle className="text-2xl">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></main>;
}
