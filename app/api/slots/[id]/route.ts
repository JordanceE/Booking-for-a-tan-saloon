import { ApiError, database, handle, json } from "@/lib/api";
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const removed = await database()
      .prepare(
        "DELETE FROM slots WHERE id = ? AND booked_at IS NULL RETURNING id",
      )
      .bind(id)
      .first();
    if (!removed)
      throw new ApiError(
        409,
        "This slot was booked or already removed. Refresh to see the latest availability.",
      );
    return json({ removed: id });
  });
}
