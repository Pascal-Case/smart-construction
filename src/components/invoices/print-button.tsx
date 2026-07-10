"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return <Button onClick={() => window.print()}><Printer data-icon="inline-start" />인쇄 / PDF 저장</Button>;
}
