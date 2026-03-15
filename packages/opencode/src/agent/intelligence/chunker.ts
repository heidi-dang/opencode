import * as ts from "typescript"
import { Filesystem } from "../../util/filesystem"

export interface CodeChunk {
  id: string
  filePath: string
  name: string
  type: "function" | "class" | "interface" | "method" | "other"
  content: string
  startLine: number
  endLine: number
  metadata?: any
}

export class CodeChunker {
  static async chunk(filePath: string): Promise<CodeChunk[]> {
    const content = await Filesystem.readText(filePath)
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    )

    const chunks: CodeChunk[] = []

    const visit = (node: ts.Node) => {
      let chunk: CodeChunk | null = null

      if (ts.isFunctionDeclaration(node) && node.name) {
        chunk = this.createChunk(sourceFile, filePath, node.name.text, "function", node)
      } else if (ts.isClassDeclaration(node) && node.name) {
        chunk = this.createChunk(sourceFile, filePath, node.name.text, "class", node)
      } else if (ts.isInterfaceDeclaration(node) && node.name) {
        chunk = this.createChunk(sourceFile, filePath, node.name.text, "interface", node)
      } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        chunk = this.createChunk(sourceFile, filePath, node.name.text, "method", node)
      }

      if (chunk) {
        chunks.push(chunk)
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    return chunks
  }

  private static createChunk(
    sourceFile: ts.SourceFile,
    filePath: string,
    name: string,
    type: CodeChunk["type"],
    node: ts.Node
  ): CodeChunk {
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    const content = node.getText(sourceFile)
    
    return {
      id: `${filePath}:${name}:${startLine}`,
      filePath,
      name,
      type,
      content,
      startLine: startLine + 1,
      endLine: endLine + 1
    }
  }
}
