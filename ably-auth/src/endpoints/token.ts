import { Str, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import Ably from "ably";

export class TokenRequestHandler extends OpenAPIRoute {
	schema = {
		tags: ["Token"],
		summary: "Request ably auth token",
		request: {
			query: z.object({
				clientId: Str({
					description: "Client ID for the token",
					required: true,
				}),
				sessionid: Str({
					description: "session ID",
					required: true
				}),
			}),
		},
		responses: {
			"200": {
				description: "Returns a token",
				content: {
					"application/json": {
						schema: z.object({
							token: z.string().describe("The Ably token"),
							keyName: z.string().describe("The Ably key name"),
							issued: z.number().describe("The time the token was issued"),
							expires: z.number().describe("The time the token expires"),
							capability: z.string().describe("The capabilities granted by the token"),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { sessionid, clientId } = data.query;

		const ably = new Ably.Rest({ key: c.env["ably-api-key"] });

		const token = await ably.auth.requestToken({
			clientId,
			capability: { [sessionid]: ["subscribe", "publish", "presence"] },
			ttl: 1 * 60 * 60 * 1000, // 1 hour
		});

		return token;
	}
}
