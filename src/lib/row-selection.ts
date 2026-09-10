const interactiveRowTargetSelector = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "details",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
].join(",");

type ClosestTarget = { closest?: (selector: string) => unknown };

export function isInteractiveRowTarget(target: EventTarget | null) {
  if (!target || typeof target !== "object") return false;
  const closest = (target as ClosestTarget).closest;
  return typeof closest === "function" && Boolean(closest.call(target, interactiveRowTargetSelector));
}
