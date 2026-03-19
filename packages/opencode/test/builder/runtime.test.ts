import { expect, test } from "bun:test"
import path from "path"
import { deploy } from "../../src/builder/runtime"
import { tmpdir } from "../fixture/fixture"

test("deploy returns a pm2 contract for a package start script", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "package.json"),
        JSON.stringify(
          {
            packageManager: "npm@10.9.0",
            scripts: {
              build: "tsc -p tsconfig.json",
              start: "node server.js",
            },
          },
          null,
          2,
        ),
      )
    },
  })

  const item = await deploy(tmp.path, { name: "Builder Demo" })

  expect(item.install).toBe("npm install")
  expect(item.build).toBe("npm run build")
  expect(item.start).toBe("npm run start")
  expect(item.detected).toBe("package:start")
  expect(item.supervisor).toEqual({
    kind: "pm2",
    name: "builder-demo",
    file: ".opencode/pm2.config.cjs",
    start: "npx --yes pm2@latest start .opencode/pm2.config.cjs --only builder-demo --update-env",
    stop: "npx --yes pm2@latest delete builder-demo",
    save: "npx --yes pm2@latest save --force",
    status: "npx --yes pm2@latest describe builder-demo",
  })
})

test("deploy prefers recorded runtime metadata for production start", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "package.json"),
        JSON.stringify(
          {
            packageManager: "bun@1.2.0",
            scripts: {
              build: "build",
            },
          },
          null,
          2,
        ),
      )
      await Bun.write(path.join(dir, "bun.lock"), "")
    },
  })

  const item = await deploy(tmp.path, {
    runtime: {
      target: "bun",
      entry: "server.ts",
    },
  })

  expect(item.install).toBe("bun install")
  expect(item.build).toBe("bun build")
  expect(item.start).toBe("bun 'server.ts'")
  expect(item.detected).toBe("release:runtime")
})

test("deploy falls back to static serving for vite builds", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              build: "vite build",
            },
            devDependencies: {
              vite: "5.4.0",
            },
          },
          null,
          2,
        ),
      )
    },
  })

  const item = await deploy(tmp.path)

  expect(item.build).toBe("npm run build")
  expect(item.start).toBe("npx --yes serve@14 dist -l tcp://0.0.0.0:$PORT")
  expect(item.detected).toBe("framework:vite-static")
  expect(item.supervisor?.kind).toBe("pm2")
})