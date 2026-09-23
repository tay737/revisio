export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div>
        <div className="h-8 w-52 animate-pulse rounded-lg bg-edge" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-edge" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-edge" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-edge" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-40 animate-pulse rounded-2xl bg-edge" />
        <div className="h-40 animate-pulse rounded-2xl bg-edge" />
      </div>
    </div>
  );
}
