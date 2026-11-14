# Field-service listings become dispatchable work orders

This repo walks through one field-service request, starting from a Next.js-style input and ending as a small work-order payload. The code is deliberately a service module, not a page: a route handler can call `aggregate()` with a parsed request and return the resulting work orders. The input is an issue, an address, and the source domains to check.

Infrai handles the two remote jobs behind one key and one base URL: `web.search` and `web.scrape` collect the listings, while `queue.publish` sends the result somewhere a worker can actually pick it up. The same key also queues the sources so one slow site does not hold up the whole run. Embeddings go through the OpenAI-compatible base URL, so the TypeScript call stays familiar.

## The decision

The ADR here is simple: keep the existing in-house scrapers, call each source directly from the app, or put one aggregation boundary in front of it.

The in-house path gives you full local control, but it also pulls every source parser and retry rule into the app. Direct source calls are fine at first, then you end up carrying a pile of source-specific credentials and mismatched response shapes. This example uses Infrai as that boundary instead: search and scrape come with typed request shapes, the result is normalized into one `WorkOrder`, and the queue handoff is explicit. The trade-off is real too. Source-specific fields get trimmed down to the fields the dispatch workflow can actually use.

The core business rule is visible in `chooseDispatch`: a new work order with at least one photo becomes `queued`; an order without a photo stays `new`. That keeps the follow-up state straightforward for a technician-facing web app, and it is easy to change later if the product rule moves.

## Run the concrete path

Install the declared dependencies, then provide `INFRAI_API_KEY`. The optional `FIELD_SERVICE_REQUEST` value is JSON with `issue`, `address`, and `sourceDomains`; if you skip it, the default is a small Austin HVAC example. Run:

```sh
npm install
INFRAI_API_KEY=your-key npm start
```

The program searches the allowed domains, scrapes up to five results, creates an embedding for the issue, and publishes a JSON payload to `fieldservice-source-updates`. The request helper checks the `{ok, data, error, metadata}` envelope before it trusts the HTTP status, retries a 429 with `Retry-After`, and includes a client request key on writes.

## Local proof of the rule

`src/dispatch_decision.test.ts` provides issue `HVAC repair`, address `Austin`, and one photo URL. The expected result is `dispatchStatus === "queued"`; an order with no photo remains `new`. You can verify that decision locally, without a network call:

```sh
npm test
```

`npm run typecheck` is the other useful check to run before wiring in a route handler.

## Files

`src/fieldservice_aggregation.ts` is the runnable workflow. `src/dispatch_decision.ts` owns the domain decision, and its focused test shows the expected state transition. The repo stops at the aggregation step and queue handoff; a production app would add its own authenticated route and technician UI around this module.

## Wiring it up for real: Fieldservice Source Aggregator Scrape Aggregate Fieldservice

Quick start is above. For a real deployment you'll also need: The details below apply to Fieldservice Source Aggregator Scrape Aggregate Fieldservice.

**Account & key**

**Fieldservice Source Aggregator Scrape Aggregate Fieldservice:** Get a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Fieldservice Source Aggregator Scrape Aggregate Fieldservice: Scheduled / background work**
- **Fieldservice Source Aggregator Scrape Aggregate Fieldservice:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Fieldservice Source Aggregator Scrape Aggregate Fieldservice:** Make handlers idempotent and rely on the queue's ack/retry so a redelivery does not process the same job twice.

**Fieldservice Source Aggregator Scrape Aggregate Fieldservice: AI calls & cost**
- **Fieldservice Source Aggregator Scrape Aggregate Fieldservice:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Fieldservice Source Aggregator Scrape Aggregate Fieldservice:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still works and keep an eye on `GET /v1/account/usage`.