// Loading placeholders shaped like the content they stand in for.
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <div className="skeleton mx-auto h-6 w-24 rounded-full" />
        <div className="mt-6 flex items-center justify-between">
          <div className="skeleton h-10 w-16 rounded-md" />
          <div className="skeleton h-16 w-28 rounded-md" />
          <div className="skeleton h-10 w-16 rounded-md" />
        </div>
        <div className="skeleton mt-6 h-3 w-full rounded" />
        <div className="skeleton mt-2 h-3 w-2/3 rounded" />
      </div>
      <div className="space-y-2">
        <div className="skeleton h-3 w-20 rounded" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
