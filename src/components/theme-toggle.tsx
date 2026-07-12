"use client";

import {
  Check,
  LayoutTemplate,
  Monitor,
  Moon,
  Palette,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useDesignTheme } from "@/components/design-theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { designTheme, setDesignTheme } = useDesignTheme();
  const { theme, setTheme } = useTheme();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="화면 테마 설정"
            title="화면 테마 설정"
          />
        }
      >
        <Palette aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>화면 테마</DialogTitle>
          <DialogDescription>
            디자인과 밝기를 따로 선택할 수 있습니다. 이 브라우저에 선택이 저장됩니다.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2" aria-labelledby="design-theme-heading">
          <div>
            <h2 id="design-theme-heading" className="text-sm font-semibold">디자인</h2>
            <p className="mt-1 text-xs text-muted-foreground">업무 흐름은 그대로 두고 화면 인상을 바꿉니다.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="디자인 선택">
            <ThemeOption
              icon={LayoutTemplate}
              label="기본 테마"
              description="현재 업무 화면"
              active={designTheme === "default"}
              onClick={() => setDesignTheme("default")}
            />
            <ThemeOption
              icon={Sparkles}
              label="사과테마"
              description="차분한 업무형 디자인"
              active={designTheme === "sagwa"}
              onClick={() => setDesignTheme("sagwa")}
            />
          </div>
        </section>

        <section className="space-y-2" aria-labelledby="color-theme-heading">
          <div>
            <h2 id="color-theme-heading" className="text-sm font-semibold">밝기</h2>
            <p className="mt-1 text-xs text-muted-foreground">시스템 설정을 따르거나 직접 고정합니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="밝기 선택">
            <ThemeOption icon={Monitor} label="시스템" active={theme === "system"} onClick={() => setTheme("system")} compact />
            <ThemeOption icon={Sun} label="밝게" active={theme === "light"} onClick={() => setTheme("light")} compact />
            <ThemeOption icon={Moon} label="어둡게" active={theme === "dark"} onClick={() => setTheme("dark")} compact />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function ThemeOption({
  icon: Icon,
  label,
  description,
  active,
  onClick,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      className={cn(
        "appearance-option relative h-auto min-w-0 justify-start whitespace-normal",
        compact ? "flex-col gap-1 px-2 py-3 text-center" : "gap-3 px-3 py-3 text-left",
      )}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className={cn("min-w-0", compact ? "text-xs" : "flex-1")}>
        <span className="block font-medium">{label}</span>
        {description && <span className={cn("mt-0.5 block text-xs", active ? "text-primary-foreground/75" : "text-muted-foreground")}>{description}</span>}
      </span>
      {active && !compact && <Check className="size-4" aria-hidden="true" />}
    </Button>
  );
}
