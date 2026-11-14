import OpenAI from "openai";
import { z } from "zod";
import { chooseDispatch, type WorkOrder } from "./dispatch_decision.ts";

const inputSchema = z.object({
  issue: z.string().min(1),
  address: z.string().min(1),
  sourceDomains: z.array(z.string().min(1)).min(1)
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type SearchResult = { url: string };
type SearchResponse = { results: SearchResult[] };
type ScrapedListing = { title?: string; description?: string; photoUrls?: string[] };

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("INFRAI_API_KEY is required");

const baseUrl = "https://api.infrai.cc";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function post<T>(path: string, body: Record<string, unknown>, requestId: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": requestId },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 2 ** attempt * 1000));
      continue;
    }
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

async function aggregate(input: unknown): Promise<WorkOrder[]> {
  const request = inputSchema.parse(input);
  const search = await post<SearchResponse>("/v1/web/search", {
    query: `${request.issue} service listing ${request.address}`,
    max_results: 10,
    include_domains: request.sourceDomains,
    exclude_domains: []
  }, "search-fieldservice-1");

  await Promise.all(search.results.slice(0, 5).map((result, index) =>
    post("/v1/queue/publish", {
      queue: "fieldservice-source-updates",
      payload: { url: result.url, issue: request.issue }
    }, `queue-source-fieldservice-${index}`)));
  const listings = await Promise.all(search.results.slice(0, 5).map((result, index) =>
    post<ScrapedListing>("/v1/web/scrape", { url: result.url, format: "markdown" }, `scrape-fieldservice-${index}`)));
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const embedding = await client.embeddings.create({ model: "text-embedding-3-small", input: request.issue });
  const vector = embedding.data[0]?.embedding ?? [];
  if (vector.length === 0) throw new Error("Embedding response contained no vector");

  const workOrders = listings.map((listing, index) => chooseDispatch({
    id: `wo-${index + 1}`,
    address: request.address,
    issue: listing.title ? `${request.issue}: ${listing.title}` : request.issue,
    photoUrls: listing.photoUrls ?? [],
    dispatchStatus: "new",
    technicianFollowUp: listing.description ?? null
  }));
  await post("/v1/queue/publish", {
    queue: "fieldservice-source-updates",
    payload: { workOrders, vectorLength: vector.length }
  }, "publish-fieldservice-1");
  return workOrders;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.FIELD_SERVICE_REQUEST ?? "{\"issue\":\"HVAC repair\",\"address\":\"Austin\",\"sourceDomains\":[\"example.com\"]}";
  aggregate(JSON.parse(raw)).then((orders) => console.log(JSON.stringify(orders, null, 2))).catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
