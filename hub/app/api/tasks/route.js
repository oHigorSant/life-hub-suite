import { NextResponse } from "next/server";
import { readTasks } from "@/lib/tasksStore";

// Read-only. The frontend never writes task data directly, except the
// move/reorder endpoint next to this one — everything else goes through chat.
export async function GET() {
  const data = await readTasks();
  return NextResponse.json(data);
}
