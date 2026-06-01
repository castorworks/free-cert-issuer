import { finalizeOrder } from "@/lib/acme";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId } = body as { orderId: string };

    if (!orderId) {
      return Response.json(
        { error: "orderId is required" },
        { status: 400 }
      );
    }

    const result = await finalizeOrder(orderId);

    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
