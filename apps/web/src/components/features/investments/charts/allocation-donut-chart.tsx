import type { PatrimonyAssetClassBucket } from "@money-manager/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = [
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#71717a", // zinc-500
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

interface AllocationDonutChartProps {
  buckets: PatrimonyAssetClassBucket[];
}

export function AllocationDonutChart({ buckets }: AllocationDonutChartProps) {
  if (buckets.length === 0) {
    return (
      <div className="glass flex h-64 items-center justify-center rounded-3xl p-4 text-center text-sm text-zinc-500 sm:rounded-[2.5rem] sm:p-6">
        Ainda não há posições para mostrar alocação.
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <h3 className="mb-4 text-base font-bold text-white sm:text-lg">
        Alocação por classe
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={buckets}
            dataKey="totalCents"
            nameKey="label"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
          >
            {buckets.map((bucket, index) => (
              <Cell key={bucket.class} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const bucket = payload[0].payload as PatrimonyAssetClassBucket;
              return (
                <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                  <p className="font-bold">{bucket.label}</p>
                  <p className="text-zinc-400">
                    {formatCurrency(bucket.totalCents)} · {bucket.percentage}%
                  </p>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 flex flex-wrap gap-3">
        {buckets.map((bucket, index) => (
          <div key={bucket.class} className="flex items-center gap-2 text-xs">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-zinc-400">{bucket.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
