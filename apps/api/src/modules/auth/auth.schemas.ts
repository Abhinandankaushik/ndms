import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format, e.g. +919876543210');

export const sendOtpSchema = z.object({ phone: phoneSchema });
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const updateMeSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
