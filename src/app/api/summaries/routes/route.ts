import { NextResponse } from "next/server";
import { getAllSummaryRoutes } from "@/lib/supabase";

export async function GET() {
  const routes = await getAllSummaryRoutes();
  return NextResponse.json(routes);
}
