import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createTagSchema,
  listTagsQuerySchema,
  tagIdParamsSchema,
  updateTagSchema,
} from "./tags.schema.js";
import * as tagsService from "./tags.service.js";

export async function list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = listTagsQuerySchema.parse(request.query);
  const result = await tagsService.listTags(query);
  await reply.send(result);
}

export async function create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = createTagSchema.parse(request.body);
  const result = await tagsService.createTag(body);
  await reply.status(201).send(result);
}

export async function get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = tagIdParamsSchema.parse(request.params);
  const result = await tagsService.getTag(id);
  await reply.send(result);
}

export async function update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = tagIdParamsSchema.parse(request.params);
  const body = updateTagSchema.parse(request.body);
  const result = await tagsService.updateTag(id, body);
  await reply.send(result);
}

export async function remove(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id } = tagIdParamsSchema.parse(request.params);
  await tagsService.deleteTag(id);
  await reply.status(204).send();
}
