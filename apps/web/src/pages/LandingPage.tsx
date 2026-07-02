/**
 * Landing de marketing em `/` (não redireciona direto para login).
 * Usuários autenticados podem ir ao dashboard; visitantes veem proposta de valor + CTAs.
 */
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Mic,
  Shield,
  Smartphone,
  Sparkles,
  Tags,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LandingDashboardPreview } from "../components/marketing/landing-dashboard-preview";
import { MarketingBackground } from "../components/marketing/marketing-background";
import { MarketingNav } from "../components/marketing/marketing-nav";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5 },
};

const features = [
  {
    icon: BarChart3,
    title: "Dashboard que responde na hora",
    description:
      "Receitas, despesas e saldo do período em cards claros. Filtre por mês e acompanhe a evolução sem abrir planilhas.",
    className: "lg:col-span-1",
  },
  {
    icon: Target,
    title: "Metas por categoria",
    description:
      "Defina limites para moradia, alimentação, lazer e mais. Saiba quando está perto do teto antes de estourar o orçamento.",
    className: "lg:col-span-1",
  },
  {
    icon: Tags,
    title: "Tags hierárquicas",
    description:
      "Organize com tags e subtags — mercado, delivery, assinaturas — e encontre qualquer lançamento em segundos.",
    className: "lg:col-span-1",
  },
  {
    icon: Mic,
    title: "Telegram com voz",
    description:
      "Envie um áudio pelo bot e a despesa entra categorizada. Ideal para registrar no momento em que o gasto acontece.",
    className: "lg:col-span-1",
  },
  {
    icon: Bell,
    title: "Pendências sob controle",
    description:
      "Despesas sem categoria aparecem no painel de alertas. Você corrige em um clique e mantém os dados consistentes.",
    className: "lg:col-span-1",
  },
  {
    icon: Smartphone,
    title: "Pronto para o celular",
    description:
      "Navegação, modais e filtros pensados para telas pequenas. O mesmo fluxo completo no desktop e no bolso.",
    className: "lg:col-span-1",
  },
];

const steps = [
  {
    step: "01",
    title: "Crie sua conta",
    description: "Cadastro simples com e-mail e senha. Seus dados ficam isolados e protegidos.",
  },
  {
    step: "02",
    title: "Configure metas e tags",
    description: "Ajuste categorias e limites conforme a sua realidade financeira.",
  },
  {
    step: "03",
    title: "Registre de qualquer lugar",
    description: "Pelo painel web ou pelo Telegram — inclusive por mensagem de voz.",
  },
];

export function LandingPage() {
  return (
    <MarketingBackground>
      <MarketingNav />

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-28 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Finanças pessoais, sem fricção
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Clareza total sobre{" "}
              <span className="gradient-text">cada real</span> que entra e sai.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
              Sistema Open Source que reúne dashboard, metas, tags e bot no Telegram em
              uma experiência premium — para quem quer decisões financeiras com
              dados confiáveis, não suposições.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/register"
                className="btn-primary group inline-flex items-center px-6 py-3 text-sm"
              >
                Começar gratuitamente
                <ArrowRight className="ml-2 inline h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/login" className="btn-ghost px-6 py-3 text-sm">
                Já tenho conta
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 border-t border-white/5 pt-8">
              {[
                { value: "100%", label: "dados sob seu controle" },
                { value: "24/7", label: "bot no Telegram" },
                // { value: "1 app", label: "web + voz integrados" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-mono text-xl font-semibold text-white">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <LandingDashboardPreview />
        </div>
      </section>

      <section className="border-t border-white/5 bg-white/[0.01] py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="mb-12 max-w-2xl">
            <p className="mb-2 text-sm font-medium text-emerald-400">
              Recursos
            </p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Tudo que você precisa para organizar a vida financeira
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-zinc-400">
              Cada módulo foi pensado para o dia a dia: registrar rápido,
              visualizar com clareza e corrigir o que faltar — sem curva de
              aprendizado absurda.
            </p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.article
                key={feature.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={`glass group rounded-2xl p-6 transition-colors hover:border-emerald-500/20 sm:rounded-3xl ${feature.className ?? ""}`}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/15">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {feature.description}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
            <motion.div {...fadeUp}>
              <p className="mb-2 text-sm font-medium text-emerald-400">
                Telegram
              </p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Registre despesas falando. O app entende e categoriza.
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-zinc-400">
                Vincule sua conta nas configurações, mande um áudio descrevendo
                o gasto e pronto — valor, descrição e meta entram no sistema
                com transcrição automática. Menos atrito, mais consistência no
                registro.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Transcrição de voz com IA local",
                  "Despesas entram como PIX por padrão",
                  "Webhook seguro em produção",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-sm text-zinc-300"
                  >
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ delay: 0.1 }}
              className="glass rounded-3xl p-6 sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                  <Mic className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Bot Money Manager
                  </p>
                  <p className="text-xs text-zinc-500">mensagem de voz · agora</p>
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-white/5 bg-zinc-950/50 p-4">
                <p className="text-sm italic text-zinc-400">
                  &ldquo;Gastei 47 reais no mercado, alimentação.&rdquo;
                </p>
                <div className="border-t border-white/5 pt-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">
                    Despesa registrada
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-white">
                    R$ 47,00
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Mercado · Alimentação · PIX
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="mb-12 text-center">
            <p className="mb-2 text-sm font-medium text-emerald-400">
              Como funciona
            </p>
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Três passos para sair do achismo
            </h2>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((item, index) => (
              <motion.div
                key={item.step}
                {...fadeUp}
                transition={{ delay: index * 0.08 }}
                className="relative glass rounded-2xl p-6 sm:rounded-3xl"
              >
                <span className="font-mono text-3xl font-bold text-emerald-500/30">
                  {item.step}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            {...fadeUp}
            className="glass relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-10 sm:py-14"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.12),transparent_70%)]"
            />
            <div className="relative">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Shield className="h-6 w-6 text-emerald-400" />
              </div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Pronto para assumir o controle das suas finanças?
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
                Crie sua conta em menos de um minuto. Sem cartão, sem
                complicação — só a ferramenta que você precisa para enxergar
                para onde o dinheiro está indo.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/register" className="btn-primary px-8 py-3 text-sm">
                  Criar conta grátis
                </Link>
                <Link to="/login" className="btn-ghost px-8 py-3 text-sm">
                  Entrar
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-xs text-zinc-600 sm:flex-row sm:px-6 sm:text-left">
          <p>© {new Date().getFullYear()} Money Manager</p>
          <p>Finanças pessoais com dashboard, metas e Telegram.</p>
        </div>
      </footer>
    </MarketingBackground>
  );
}
