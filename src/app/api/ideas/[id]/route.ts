import { NextRequest, NextResponse } from "next/server";
import { deleteIdea } from "@/lib/ideas";

/** DELETE /api/ideas/[id] → 204 | 404 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!deleteIdea(id)) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
