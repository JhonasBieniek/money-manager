"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { ArrowRight, Wallet, TrendingUp, PieChart } from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.3,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 20,
    },
  },
};

export default function HomePage() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[400px] w-[400px] rounded-full bg-zinc-500/10 blur-[100px]" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="z-10 w-full max-w-4xl text-center"
      >
        <motion.div variants={itemVariants} className="mb-6 flex justify-center">
          <div className="glass flex h-16 w-16 items-center justify-center rounded-2xl">
            <Wallet className="h-8 w-8 text-emerald-400" />
          </div>
        </motion.div>

        <motion.h1
          variants={itemVariants}
          className="mb-6 text-5xl font-bold tracking-tight text-white md:text-7xl"
        >
          Money Manager
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="mx-auto mb-10 max-w-[60ch] text-lg text-zinc-400 md:text-xl"
        >
          Assuma o controle total das suas finanças com uma interface intuitiva, 
          insights inteligentes e design premium focado na sua produtividade.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link
            href="/dashboard"
            className="group flex h-14 items-center gap-2 rounded-xl bg-emerald-500 px-8 font-semibold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98]"
          >
            Acessar Dashboard
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="mt-24 grid grid-cols-1 gap-6 text-left md:grid-cols-3"
        >
          {[
            {
              icon: TrendingUp,
              title: "Gestão Ágil",
              desc: "Controle suas despesas em segundos com nossa interface otimizada.",
            },
            {
              icon: PieChart,
              title: "Tags",
              desc: "Organize seus gastos e receitas com rótulos e sub-tags.",
            },
            {
              icon: Wallet,
              title: "Segurança",
              desc: "Seus dados protegidos com criptografia de ponta a ponta.",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="glass group p-8 rounded-[2rem] transition-all hover:border-emerald-500/30"
            >
              <feature.icon className="mb-4 h-6 w-6 text-emerald-400" />
              <h3 className="mb-2 text-lg font-bold text-white">{feature.title}</h3>
              <p className="text-sm text-zinc-400">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </main>
  );
}
