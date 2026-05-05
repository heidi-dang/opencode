import path from "path"
import { Filesystem } from "@/util/filesystem"

export interface SkillEntry {
  name: string
  description: string
  location: string
}

export class MockRegistry {
  private skills: SkillEntry[] = []

  constructor(private readonly baseDir: string) {}

  async load() {
    // Load skills from local directory instead of network
    const files = new Bun.Glob("*.ts").scanSync({ cwd: this.baseDir })
    
    for (const file of files) {
      const content = await Filesystem.readText(path.join(this.baseDir, file))
      const nameMatch = content.match(/name:\s*"([^"]+)"/)
      const descMatch = content.match(/description:\s*"([^"]+)"/)
      
      if (nameMatch) {
        this.skills.push({
          name: nameMatch[1],
          description: descMatch?.[1] || "",
          location: path.join(this.baseDir, file),
        })
      }
    }
  }

  find(name: string): SkillEntry | undefined {
    return this.skills.find((s) => s.name === name)
  }

  list(): SkillEntry[] {
    return [...this.skills]
  }
}
