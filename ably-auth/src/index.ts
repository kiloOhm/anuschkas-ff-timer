import { fromHono } from "chanfana";
import { Hono } from "hono";
import { TokenRequestHandler } from "./endpoints/token";
import { cors } from 'hono/cors'

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', cors({
	origin: "*",
	allowMethods: ["GET", "POST", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization"],
}))

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.get("/api/token", TokenRequestHandler);

// Export the Hono app
export default app;
