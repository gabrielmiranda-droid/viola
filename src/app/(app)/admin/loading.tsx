import { Card, Panel } from "@/components/ui/card";

export default function AdminLoading() {
  return (
    <Panel>
      <div className="mb-6">
        <div className="h-3 w-20 rounded-full bg-panel-strong" />
        <div className="mt-3 h-8 w-56 rounded-lg bg-panel-strong" />
        <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-panel-strong" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="min-h-32 animate-pulse">
            <div className="h-4 w-28 rounded-full bg-panel-strong" />
            <div className="mt-5 h-8 w-32 rounded-lg bg-panel-strong" />
            <div className="mt-4 h-3 w-40 rounded-full bg-panel-strong" />
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="min-h-64 animate-pulse">
            <div className="h-5 w-44 rounded-full bg-panel-strong" />
            <div className="mt-6 space-y-3">
              <div className="h-14 rounded-lg bg-panel-strong" />
              <div className="h-14 rounded-lg bg-panel-strong" />
              <div className="h-14 rounded-lg bg-panel-strong" />
            </div>
          </Card>
        ))}
      </div>
    </Panel>
  );
}
