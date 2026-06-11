import { Card, Panel } from "@/components/ui/card";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

export default function LoadingCashier() {
  return (
    <Panel>
      <div className="mb-5 space-y-2">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="h-9 w-64" />
        <SkeletonBlock className="h-4 w-96 max-w-full" />
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </Card>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-32" />
          ))}
        </div>
        <SkeletonBlock className="h-[520px]" />
      </div>
    </Panel>
  );
}
