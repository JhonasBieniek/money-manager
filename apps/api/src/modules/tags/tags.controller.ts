import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createTagBodySchema,
  listTagsQuerySchema,
  tagIdParamsSchema,
  updateTagBodySchema,
} from "./tags.schema.js";
import * as tagsService from "./tags.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const body = createTagBodySchema.parse(req.body);
  const result = await tagsService.createTag(getUserId(req), body);
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = listTagsQuerySchema.parse(req.query);
  const result = await tagsService.listTags(getUserId(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = tagIdParamsSchema.parse(req.params);
  const tag = await tagsService.getTag(getUserId(req), id);
  res.status(200).json(tag);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = tagIdParamsSchema.parse(req.params);
  const body = updateTagBodySchema.parse(req.body);
  const tag = await tagsService.updateTag(getUserId(req), id, body);
  res.status(200).json(tag);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = tagIdParamsSchema.parse(req.params);
  await tagsService.deleteTag(getUserId(req), id);
  res.status(204).send();
}
