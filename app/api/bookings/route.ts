import { z } from "zod";
import { body, database, handle, json } from "@/lib/api";
import { reserveSlot } from "@/lib/reservations";
import { providers } from "@/lib/integrations/runtime";
export async function POST(request: Request) {
  return handle(async () => {
    const data = await body(
      request,
      z
        .object({
          slotId: z.string().uuid("Please choose a session."),
          name: z
            .string()
            .trim()
            .min(2, "Please enter your full name.")
            .max(100, "Please use a shorter name."),
          email: z
            .string()
            .trim()
            .email("Please enter a valid email address.")
            .max(254),
        })
        .strict(),
    );
    return json(await reserveSlot(database(), providers().calendar, data), 201);
  });
}
