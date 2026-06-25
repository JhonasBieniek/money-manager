import { motion } from "framer-motion";
import { DashboardHistory } from "../components/features/dashboard/dashboard-history";
import { DashboardSummary } from "../components/features/dashboard/dashboard-summary";

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-6 py-12">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="max-w-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Sistema Online
          </span>
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Bem-vindo de volta!
        </h1>
        <p className="text-lg text-zinc-400">
          Aqui está um resumo do seu desempenho financeiro este mês.
        </p>
      </motion.div>

      <DashboardSummary />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="mb-6 text-2xl font-bold text-white">
          Histórico Financeiro
        </h2>
        <DashboardHistory />
      </motion.div>
    </div>
  );
}
