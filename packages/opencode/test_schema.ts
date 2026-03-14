import { Config } from "./src/config/config"
import { ConfigMarkdown } from "./src/config/markdown"
import path from "path"

async function test() {
  const filePath = "/home/heidi/work/opencode/.opencode/agent/tool-forge.md"
  try {
    const md = await ConfigMarkdown.parse(filePath)
    const config = {
      name: "tool-forge",
      ...md.data,
      prompt: md.content.trim(),
    }
    console.log("Config to parse:", JSON.stringify(config, null, 2))
    const parsed = Config.Agent.safeParse(config)
    if (parsed.success) {
      console.log("Successfully parsed!")
    } else {
      console.log("Validation Failed!")
      console.log(JSON.stringify(parsed.error.issues, null, 2))
    }
  } catch (err: any) {
    console.error("Error during test:", err)
  }
}

test()
