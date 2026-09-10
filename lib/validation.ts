import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Некорректная дата");
export const orderInput = z.object({
  requestId: z.string().uuid(),
  contact: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(160),
    phone: z
      .string()
      .trim()
      .max(25)
      .regex(/^[+\d()\s-]+$/)
      .refine((value) => {
        const length = value.replace(/\D/g, "").length;
        return length >= 7 && length <= 15;
      }),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(60),
        quantity: z.number().int().min(1).max(6),
        range: z
          .object({ start: date, end: date })
          .refine((value) => value.start <= value.end),
      }),
    )
    .min(1)
    .max(12),
});
