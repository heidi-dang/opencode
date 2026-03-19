import { ReasoningTool } from "./packages/opencode/src/tool/reasoning"
import { BlueprintTool } from "./packages/opencode/src/tool/blueprint"
import { AdrTool } from "./packages/opencode/src/tool/adr"
import { Instance } from "./packages/opencode/src/project/instance"

async function run() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      console.log("Starting Phase 7 Verification...")

      // 1. Verify ReasoningTool
      const reasoning = await ReasoningTool.init()
      console.log("\n1. Testing ReasoningTool...")
      const res1 = await reasoning.execute({ goal: "Implement Phase 7" }, {} as any)
      console.log("Result:", res1.title, res1.output)

      // 2. Verify BlueprintTool
      const blueprint = await BlueprintTool.init()
      console.log("\n2. Testing BlueprintTool (Scaffolding new_tool)...")
      const res2 = await blueprint.execute({ 
        type: "tool", 
        name: "verify_demo_tool", 
        description: "A tool for testing scaffolding."
      }, {} as any)
      console.log("Result:", res2.title, res2.output)

      // 3. Verify AdrTool
      const adr = await AdrTool.init()
      console.log("\n3. Testing AdrTool...")
      const res3 = await adr.execute({
        title: "Standardize Phase 7 Tools",
        context: "We need consistent patterns for Phase 7.",
        decision: "Use Reasoning and Blueprint tools.",
        consequences: "Faster and more consistent expansion."
      }, {} as any)
      console.log("Result:", res3.title, res3.output)

      console.log("\nPhase 7 Foundation Verification Complete.")
    }
  })
}

run().catch(console.error)
