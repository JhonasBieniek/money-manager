import {
  ArrowRight,
  MessageCircle,
  Receipt,
  Sparkles,
  Tags,
  Target,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/cn";

type OnboardingOverlayProps = {
  onDismiss: () => void;
};

const steps = [
  {
    icon: Target,
    title: "Defina suas metas",
    description:
      "Distribua seu orçamento por categorias e acompanhe o quanto já gastou de cada teto.",
    href: "/dashboard/goals",
    cta: "Ir para Metas",
  },
  {
    icon: Tags,
    title: "Crie tags de organização",
    description:
      "Use tags e subtags para classificar despesas e receitas do seu jeito.",
    href: "/dashboard/tags",
    cta: "Ir para Tags",
  },
  {
    icon: MessageCircle,
    title: "Vincule o Telegram",
    description:
      "Conecte o bot e registre despesas por mensagem de voz no dia a dia.",
    href: "/dashboard/settings",
    cta: "Vincular Telegram",
  },
  {
    icon: Receipt,
    title: "Registre movimentações",
    description:
      "Adicione sua primeira despesa ou receita para substituir esta prévia por dados reais.",
    href: "/dashboard/expenses",
    cta: "Nova despesa",
  },
];

/** Área do painel principal (abaixo do header; acima do bottom nav no mobile). */
const contentAreaClass =
  "fixed z-[35] top-14 sm:top-16 left-0 right-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:bottom-0 lg:left-64";

export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          contentAreaClass,
          "pointer-events-none bg-zinc-950/35 backdrop-blur-[2px]",
        )}
      />

      <div
        className={cn(
          contentAreaClass,
          "pointer-events-none flex items-end justify-center p-3 sm:p-5 lg:items-stretch lg:justify-end lg:p-6",
        )}
      >
        <aside
          className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/15 bg-zinc-950/88 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:w-[min(100%,26rem)]"
          aria-labelledby="onboarding-title"
        >
          <div className="shrink-0 border-b border-white/5 px-5 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1.5 inline-flex items-center gap-2 text-xs font-medium text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Primeiros passos
                </p>
                <h2
                  id="onboarding-title"
                  className="text-balance text-lg font-semibold tracking-tight text-white sm:text-xl"
                >
                  Configure sua conta
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  Role o painel ao fundo para ver a prévia. Use o menu para
                  visitar cada seção e volte ao Resumo para este guia.
                </p>
              </div>
              <button
                type="button"
                onClick={onDismiss}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fechar tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4 sm:space-y-3 sm:px-6">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/8 bg-white/[0.04] p-4"
              >
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <step.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                      Passo {index + 1}
                    </p>
                    <h3 className="mt-0.5 text-sm font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      {step.description}
                    </p>
                    <Link
                      to={step.href}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300 sm:text-sm"
                    >
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={onDismiss}
              className="btn-ghost w-full text-sm sm:w-auto"
            >
              Pular tutorial
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="btn-primary w-full text-sm sm:w-auto"
            >
              Usar meu painel
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
