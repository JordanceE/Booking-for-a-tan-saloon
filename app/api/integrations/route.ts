import { json } from "@/lib/api";
import { providers } from "@/lib/integrations/runtime";
export const dynamic = "force-dynamic";
export async function GET() {
  return json(providers().status);
}
