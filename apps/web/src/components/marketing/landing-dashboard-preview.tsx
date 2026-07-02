import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";

const cards = [
  {
    label: "Receitas",
    value: "R$ 12.840",
    cents: ",00",
    icon: TrendingUp,
    tone: "text-emerald-400",
    bar: "w-[72%] bg-emerald-500/40",
  },
  {
    label: "Despesas",
    value: "R$ 8.230",
    cents: ",50",
    icon: TrendingDown,
    tone: "text-rose-400",
    bar: "w-[58%] bg-rose-500/30",
  },
  {
    label: "Saldo",
    value: "R$ 4.609",
    cents: ",50",
    icon: Wallet,
    tone: "text-white",
    bar: "w-[44%] bg-white/20",
  },
];

export function LandingDashboardPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 }}
      className="glass relative overflow-hidden rounded-3xl border-white/10 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/20 blur-2xl"
      />
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Resumo · março
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-300">
            Visão geral das finanças
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
          Ao vivo
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 + index * 0.08 }}
            className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">{card.label}</span>
              <card.icon className={`h-4 w-4 ${card.tone}`} />
            </div>
            <p className="font-mono text-lg font-semibold tracking-tight text-white">
              {card.value}
              <span className="text-zinc-500">{card.cents}</span>
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full ${card.bar}`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
          <span>Metas do mês</span>
          <span className="text-emerald-400">3 de 5 no alvo</span>
        </div>
        <div className="space-y-2.5">
          {[
            { name: "Moradia", pct: 68 },
            { name: "Alimentação", pct: 84 },
            { name: "Lazer", pct: 41 },
          ].map((goal) => (
            <div key={goal.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-zinc-400">{goal.name}</span>
                <span className="font-mono text-zinc-500">{goal.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-emerald-500/70"
                  style={{ width: `${goal.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
