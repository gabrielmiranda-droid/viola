import { Card, Panel } from "@/components/ui/card";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

export default function LoadingInventory() {
  return (
    <Panel>
      <div className="mb-5 space-y-2">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-9 w-48" />
        <SkeletonBlock className="h-4 w-96 max-w-full" />
      </div>
      <Card>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </Card>
      <Card className="mt-4">
        <SkeletonBlock className="h-12" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-32" />
          ))}
        </div>
      </Card>
    </Panel>
  );
}
