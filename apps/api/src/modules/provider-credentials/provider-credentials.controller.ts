import type { Request, Response } from "express";
import { QuoteProviderError } from "../investments/pricing/types.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error.js";
import { getUserId } from "../../shared/types/request.js";
import {
  providerParamsSchema,
  setProviderCredentialBodySchema,
} from "./provider-credentials.schema.js";
import * as providerCredentialsService from "./provider-credentials.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const items = await providerCredentialsService.listCredentials(getUserId(req));
  res.status(200).json({ items });
}

export async function set(req: Request, res: Response): Promise<void> {
  const { provider } = providerParamsSchema.parse(req.params);
  const { apiKey } = setProviderCredentialBodySchema.parse(req.body);

  try {
    await providerCredentialsService.setCredential(getUserId(req), provider, apiKey);
  } catch (err) {
    if (err instanceof QuoteProviderError) {
      throw new BadRequestError(
        "Não foi possível validar essa chave. Confira se ela está correta.",
      );
    }
    throw err;
  }

  res.status(204).send();
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { provider } = providerParamsSchema.parse(req.params);
  const deleted = await providerCredentialsService.deleteCredential(
    getUserId(req),
    provider,
  );
  if (!deleted) {
    throw new NotFoundError("Nenhuma chave configurada para esse provider");
  }
  res.status(204).send();
}
