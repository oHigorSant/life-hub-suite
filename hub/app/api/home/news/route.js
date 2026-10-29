import { json, handle } from "@/lib/notas/http.js";
import { getNews } from "@/lib/home/feeds.js";

export const dynamic = "force-dynamic";

// GET /api/home/news[?force=1] -> { items: [{ source, title, summary, image, url, date }], at }
export const GET = handle(async (request) => {
  const force = new URL(request.url).searchParams.get("force") === "1";
  return json(await getNews({ force }));
});
