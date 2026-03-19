import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { BuilderSecret } from "../../src/builder/secret"
import { BuilderState } from "../../src/builder/state"
import { Global } from "../../src/global"
import { Instance } from "../../src/project/instance"
import { Storage } from "../../src/storage/storage"
import { tmpdir } from "../fixture/fixture"

test("builder secrets stay out of builder state", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(path.join(dir, ".deploy.env"), "FILE_TOKEN=file-secret\n")
    },
  })

  process.env["DEPLOY_TOKEN"] = "env-secret"

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const key = await BuilderSecret.create({
        value: "super-secret",
        label: "api",
      })

      const item = await BuilderState.environment({
        name: "prod",
        vars: {
          API_KEY: key,
          FROM_ENV: { source: "env", name: "DEPLOY_TOKEN" },
          FROM_FILE: { source: "file", path: path.join(tmp.path, ".deploy.env"), key: "FILE_TOKEN" },
          FROM_EXT: { source: "external", uri: "op://deploy/prod/api_key" },
        },
      })

      expect(item.vars.API_KEY.source).toBe("local")
      expect(item.vars.API_KEY.redacted).toBe("local:api")
      expect(item.vars.FROM_ENV.redacted).toBe("env:DEPLOY_TOKEN")
      expect(item.vars.FROM_FILE.redacted).toBe("file:.deploy.env#FILE_TOKEN")
      expect(item.vars.FROM_EXT.redacted).toBe("external:op://deploy/prod/api_key")

      expect(await BuilderSecret.resolve(item.vars.API_KEY)).toEqual({ mode: "value", value: "super-secret" })
      expect(await BuilderSecret.resolve(item.vars.FROM_ENV)).toEqual({ mode: "value", value: "env-secret" })
      expect(await BuilderSecret.resolve(item.vars.FROM_FILE)).toEqual({ mode: "value", value: "file-secret" })
      expect(await BuilderSecret.resolve(item.vars.FROM_EXT)).toEqual({ mode: "external", uri: "op://deploy/prod/api_key" })

      const state = path.join(Global.Path.data, "storage", "builder", `${Instance.project.id}.json`)
      const text = await Bun.file(state).text()
      expect(text).not.toContain("super-secret")
      expect(text).toContain('"source": "local"')

      const file = path.join(Global.Path.data, "builder", "secret", `${Instance.project.id}.json`)
      const data = await Bun.file(file).text()
      expect(data).toContain("super-secret")

      if (process.platform !== "win32") {
        expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
      }
    },
  })

  delete process.env["DEPLOY_TOKEN"]
})

test("builder state migrates inline vars into the secret store", async () => {
  await using tmp = await tmpdir()

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const ts = Date.now()
      await Storage.write(["builder", Instance.project.id], {
        id: `bld_${Instance.project.id}`,
        projectID: Instance.project.id,
        directory: Instance.directory,
        title: "Builder",
        environmentID: "env_1",
        environments: [
          {
            id: "env_1",
            name: "prod",
            vars: {
              API_KEY: "legacy-secret",
            },
            createdAt: ts,
            updatedAt: ts,
          },
        ],
        preview: { status: "idle" },
        releases: [],
        deploys: [],
        rollbacks: [],
        annotations: [],
        createdAt: ts,
        updatedAt: ts,
      })

      const state = await BuilderState.get()
      const ref = state.environments[0].vars.API_KEY
      expect(ref.source).toBe("local")
      expect(await BuilderSecret.resolve(ref)).toEqual({ mode: "value", value: "legacy-secret" })

      const store = path.join(Global.Path.data, "storage", "builder", `${Instance.project.id}.json`)
      expect(await Bun.file(store).text()).not.toContain("legacy-secret")

      const file = path.join(Global.Path.data, "builder", "secret", `${Instance.project.id}.json`)
      expect(await Bun.file(file).text()).toContain("legacy-secret")
    },
  })
})