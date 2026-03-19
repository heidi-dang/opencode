import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { Config } from "../../config/config"
import { Provider } from "../../provider/provider"
import { ModelsDev } from "../../provider/models"
import { ProviderAuth } from "../../provider/auth"
import { ProviderID } from "../../provider/schema"
import { Instance } from "../../project/instance"
import { SessionStats, aggregateSessionStats } from "../../session/stats"
import { mapValues } from "remeda"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

const ProviderSummary = z.object({
  providerID: ProviderID.zod,
  name: z.string(),
  connected: z.boolean(),
  defaultModel: z.string().optional(),
  project: z.object({
    id: z.string(),
    name: z.string().optional(),
    worktree: z.string(),
    directory: z.string(),
  }),
  usage: z.object({
    totalSessions: SessionStats.shape.totalSessions,
    totalMessages: SessionStats.shape.totalMessages,
    totalCost: SessionStats.shape.totalCost,
    totalTokens: SessionStats.shape.totalTokens,
    days: SessionStats.shape.days,
    lastUpdated: z.number().optional(),
    topModels: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        messages: z.number(),
        cost: z.number(),
        tokens: z.object({
          input: z.number(),
          output: z.number(),
          cache: z.object({
            read: z.number(),
            write: z.number(),
          }),
        }),
      }),
    ),
  }),
  models: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      context: z.number().nullable(),
      output: z.number().nullable(),
      status: z.string(),
      releaseDate: z.string(),
      default: z.boolean(),
    }),
  ),
})

async function providers() {
  const config = await Config.get()
  const disabled = new Set(config.disabled_providers ?? [])
  const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined

  const allProviders = await ModelsDev.get()
  const filteredProviders: Record<string, (typeof allProviders)[string]> = {}
  for (const [key, value] of Object.entries(allProviders)) {
    if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) {
      filteredProviders[key] = value
    }
  }

  const connected = await Provider.list()
  const all = Object.assign(
    mapValues(filteredProviders, (x) => Provider.fromModelsDevProvider(x)),
    connected,
  )
  return {
    all: Object.values(all),
    default: mapValues(all, (item) => Provider.sort(Object.values(item.models))[0].id),
    connected: Object.keys(connected),
  }
}

export const ProviderRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List providers",
        description: "Get a list of all available AI providers, including both available and connected ones.",
        operationId: "provider.list",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    all: ModelsDev.Provider.array(),
                    default: z.record(z.string(), z.string()),
                    connected: z.array(z.string()),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await providers())
      },
    )
    .get(
      "/:providerID/summary",
      describeRoute({
        summary: "Get provider summary",
        description: "Retrieve connection, model, project, and usage summary data for a specific provider.",
        operationId: "provider.summary",
        responses: {
          200: {
            description: "Provider summary",
            content: {
              "application/json": {
                schema: resolver(ProviderSummary),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const data = await providers()
        const item = data.all.find((provider) => provider.id === providerID)
        if (!item) {
          throw new HTTPException(404, { message: `Provider not found: ${providerID}` })
        }

        const stats = await aggregateSessionStats({
          projectID: Instance.project.id,
          providerID,
        })

        const models = Provider.sort(Object.values(item.models)).map((model) => ({
          id: model.id,
          name: model.name,
          context: model.limit.context ?? null,
          output: model.limit.output ?? null,
          status: model.status,
          releaseDate: model.release_date,
          default: data.default[item.id] === model.id,
        }))

        const topModels = Object.entries(stats.modelUsage)
          .sort(([, a], [, b]) => b.messages - a.messages)
          .slice(0, 5)
          .map(([key, value]) => {
            const id = key.startsWith(`${providerID}/`) ? key.slice(providerID.length + 1) : key
            return {
              id,
              name: item.models[id]?.name ?? id,
              messages: value.messages,
              cost: value.cost,
              tokens: value.tokens,
            }
          })

        return c.json({
          providerID,
          name: item.name,
          connected: data.connected.includes(providerID),
          defaultModel: data.default[item.id],
          project: {
            id: Instance.project.id,
            name: Instance.project.name,
            worktree: Instance.project.worktree,
            directory: Instance.directory,
          },
          usage: {
            totalSessions: stats.totalSessions,
            totalMessages: stats.totalMessages,
            totalCost: stats.totalCost,
            totalTokens: stats.totalTokens,
            days: stats.days,
            lastUpdated: stats.totalSessions ? stats.dateRange.latest : undefined,
            topModels,
          },
          models,
        })
      },
    )
    .get(
      "/auth",
      describeRoute({
        summary: "Get provider auth methods",
        description: "Retrieve available authentication methods for all AI providers.",
        operationId: "provider.auth",
        responses: {
          200: {
            description: "Provider auth methods",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), z.array(ProviderAuth.Method))),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await ProviderAuth.methods())
      },
    )
    .post(
      "/:providerID/oauth/authorize",
      describeRoute({
        summary: "OAuth authorize",
        description: "Initiate OAuth authorization for a specific AI provider to get an authorization URL.",
        operationId: "provider.oauth.authorize",
        responses: {
          200: {
            description: "Authorization URL and method",
            content: {
              "application/json": {
                schema: resolver(ProviderAuth.Authorization.optional()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          inputs: z.record(z.string(), z.string()).optional().meta({ description: "Prompt inputs" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, inputs } = c.req.valid("json")
        const result = await ProviderAuth.authorize({
          providerID,
          method,
          inputs,
        })
        return c.json(result)
      },
    )
    .post(
      "/:providerID/oauth/callback",
      describeRoute({
        summary: "OAuth callback",
        description: "Handle the OAuth callback from a provider after user authorization.",
        operationId: "provider.oauth.callback",
        responses: {
          200: {
            description: "OAuth callback processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "param",
        z.object({
          providerID: ProviderID.zod.meta({ description: "Provider ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          method: z.number().meta({ description: "Auth method index" }),
          code: z.string().optional().meta({ description: "OAuth authorization code" }),
        }),
      ),
      async (c) => {
        const providerID = c.req.valid("param").providerID
        const { method, code } = c.req.valid("json")
        await ProviderAuth.callback({
          providerID,
          method,
          code,
        })
        return c.json(true)
      },
    ),
)
