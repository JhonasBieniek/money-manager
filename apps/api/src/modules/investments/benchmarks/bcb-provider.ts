const BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";
const DATE_FORMAT_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

export interface BcbSeriesPoint {
  date: string; // "YYYY-MM-DD", exactly as returned by BCB — not forced to day 1
  value: number;
}

export class BcbProviderError extends Error {}

interface BcbRawPoint {
  data: string;
  valor: string;
}

function normalizeBcbDate(brDate: string): string {
  const [day, month, year] = brDate.split("/");
  return `${year}-${month}-${day}`;
}

export function createBcbProvider(fetchFn: typeof fetch = fetch) {
  return {
    async fetchSeries(
      seriesCode: number,
      lastN: number,
    ): Promise<BcbSeriesPoint[]> {
      const url = `${BCB_SGS_BASE_URL}.${seriesCode}/dados/ultimos/${lastN}?formato=json`;

      let response: Response;
      try {
        response = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        throw new BcbProviderError(
          `Falha ao consultar BCB SGS série ${seriesCode}`,
        );
      }

      if (!response.ok) {
        throw new BcbProviderError(
          `BCB SGS retornou status ${response.status} para série ${seriesCode}`,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new BcbProviderError(
          `BCB SGS retornou resposta inválida para série ${seriesCode}`,
        );
      }

      if (!Array.isArray(data)) {
        throw new BcbProviderError(
          `BCB SGS retornou formato inesperado para série ${seriesCode}`,
        );
      }

      return (data as BcbRawPoint[]).map((point) => {
        const value = Number(point?.valor);
        if (
          typeof point?.data !== "string" ||
          !DATE_FORMAT_REGEX.test(point.data) ||
          typeof point?.valor !== "string" ||
          point.valor.trim() === "" ||
          !Number.isFinite(value)
        ) {
          throw new BcbProviderError(
            `BCB SGS retornou ponto inválido para série ${seriesCode}`,
          );
        }
        return { date: normalizeBcbDate(point.data), value };
      });
    },
  };
}
