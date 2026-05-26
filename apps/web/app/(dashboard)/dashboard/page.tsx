"use client";

import { motion } from "framer-motion";
import { DashboardSummary } from "@/components/features/dashboard/dashboard-summary";
import { DashboardHistory } from "@/components/features/dashboard/dashboard-history";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12 space-y-12">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="max-w-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500">
            Sistema Online
          </span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
          Bem-vindo de volta!
        </h1>
        <p className="text-zinc-400 text-lg">
          Aqui está um resumo do seu desempenho financeiro este mês.
        </p>
      </motion.div>

      <DashboardSummary />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="text-2xl font-bold text-white mb-6">
          Histórico Financeiro
        </h2>
        <DashboardHistory />
      </motion.div>
    </div>
  );
}
