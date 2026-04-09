import { EMAIL_MAX, PASSWORD_MAX } from "@money-manager/utils";
import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email().max(EMAIL_MAX),
  password: z.string().min(8).max(PASSWORD_MAX),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().email().max(EMAIL_MAX),
  password: z.string().max(PASSWORD_MAX),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
