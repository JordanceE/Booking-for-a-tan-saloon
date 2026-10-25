import { z } from "zod";
import { body, database, handle, json } from "@/lib/api";
import { bookingConfirmation } from "@/lib/confirmations";
import { providers } from "@/lib/integrations/runtime";
export async function POST(request: Request) {
  return handle(async () => {
    const data = await body(
      request,
      z
        .object({
          slotId: z.string().uuid(),
          token: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    );
    const confirmation = await bookingConfirmation(
      database(),
      providers().ai,
      data.slotId,
      data.token,
    );
    return json(confirmation, confirmation.pending ? 202 : 200);
  });
}
