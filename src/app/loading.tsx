export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-56 animate-pulse rounded-3xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-40 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <span className="sr-only">화면을 불러오는 중입니다.</span>
    </div>
  );
}
