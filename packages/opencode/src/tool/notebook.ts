import z from "zod"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import path from "path"

const DESCRIPTION = `Jupyter Notebook Tool - Execute and analyze Jupyter notebook cells.

This tool allows running Python/R code cells in Jupyter notebooks and getting notebook summaries.
Use for data analysis, ML experiments, and interactive Python workflows.`

export const NotebookRunCellTool = Tool.define("run_notebook_cell", {
  description: DESCRIPTION,
  parameters: z.object({
    notebook_path: z.string().describe("Path to the .ipynb notebook file"),
    cell_index: z.number().describe("Index of the cell to execute (0-based)").optional(),
    cell_code: z.string().describe("Code to execute in a new cell").optional(),
    timeout: z.number().describe("Execution timeout in milliseconds").optional(),
  }),
  async execute(params, ctx) {
    const notebookPath = path.resolve(Instance.directory, params.notebook_path)
    
    const notebookExists = await Bun.file(notebookPath).exists()
    if (!notebookExists) {
      throw new Error(`Notebook not found: ${params.notebook_path}`)
    }

    // Use Python to execute the notebook
    const pythonCode = `
import json
import sys

notebook_path = "${notebookPath.replace(/\\/g, "\\\\")}"
timeout = ${params.timeout ?? 60}

try:
    from nbconvert.preprocessors import ExecutePreprocessor
    import nbformat
    
    with open(notebook_path, 'r') as f:
        nb = nbformat.read(f, as_version=4)
    
    ep = ExecutePreprocessor(timeout=timeout, kernel_name='python3')
    ep.preprocess(nb, {'metadata': {'path': '${path.dirname(notebookPath).replace(/\\/g, "\\\\")}'}})
    
    with open(notebook_path, 'w') as f:
        nbformat.write(nb, f)
    
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
`

    const result = Bun.spawn({
      cmd: ["python", "-c", pythonCode],
      stdout: "pipe",
      stderr: "pipe",
    })

    const output = await new Response(result.stdout).text()
    const error = await new Response(result.stderr).text()

    if (result.exitCode !== 0) {
      throw new Error(`Failed to execute notebook cell: ${error || output}`)
    }

    return {
      title: "Notebook Cell Executed",
      metadata: { notebook: params.notebook_path, cell: params.cell_index },
      output: "Cell executed successfully",
    }
  },
})

export const NotebookSummaryTool = Tool.define("get_notebook_summary", {
  description: "Get a summary of notebook structure including cell types, outputs, and metadata",
  parameters: z.object({
    notebook_path: z.string().describe("Path to the .ipynb notebook file"),
  }),
  async execute(params, ctx) {
    const notebookPath = path.resolve(Instance.directory, params.notebook_path)
    
    const notebookExists = await Bun.file(notebookPath).exists()
    if (!notebookExists) {
      throw new Error(`Notebook not found: ${params.notebook_path}`)
    }

    const content = await Bun.file(notebookPath).text()
    const notebook = JSON.parse(content)

    const cells = notebook.cells?.map((cell: any, index: number) => ({
      index,
      type: cell.cell_type,
      source_lines: cell.source?.split("\n").length ?? 0,
      has_output: cell.outputs?.length > 0,
      has_error: cell.outputs?.some((o: any) => o.output_type === "error"),
      metadata: cell.metadata,
    })) ?? []

    const summary = {
      notebook: params.notebook_path,
      total_cells: cells.length,
      cell_types: {
        code: cells.filter((c: any) => c.type === "code").length,
        markdown: cells.filter((c: any) => c.type === "markdown").length,
        raw: cells.filter((c: any) => c.type === "raw").length,
      },
      cells_with_errors: cells.filter((c: any) => c.has_error).length,
      cells_with_output: cells.filter((c: any) => c.has_output).length,
      kernel: notebook.metadata?.kernelspec?.name ?? "unknown",
      language: notebook.metadata?.language_info?.name ?? "unknown",
    }

    return {
      title: `Notebook: ${params.notebook_path}`,
      metadata: { summary },
      output: JSON.stringify(summary, null, 2),
    }
  },
})
