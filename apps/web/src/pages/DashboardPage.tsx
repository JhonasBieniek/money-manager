import { motion } from "framer-motion";
import { DashboardHistory } from "../components/features/dashboard/dashboard-history";
import { DashboardSummary } from "../components/features/dashboard/dashboard-summary";

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 sm:space-y-12">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="max-w-2xl"
      >
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Sistema Online
          </span>
        </div>
        <h1 className="mb-3 text-2xl font-bold tracking-tight text-white sm:mb-4 sm:text-4xl md:text-5xl">
          Bem-vindo de volta!
        </h1>
        <p className="text-base text-zinc-400 sm:text-lg">
          Aqui está um resumo do seu desempenho financeiro.
        </p>
      </motion.div>

      <DashboardSummary />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="mb-4 text-xl font-bold text-white sm:mb-6 sm:text-2xl">
          Histórico Financeiro
        </h2>
        <DashboardHistory />
      </motion.div>
    </div>
  );
}
