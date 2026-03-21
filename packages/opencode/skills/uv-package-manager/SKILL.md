---
name: uv-package-manager
description: Use when executing Python scripts or resolving dependencies. High-speed Rust-based Python package manager.
---

# UV Package Manager

When working in Python environments or running Python verification scripts, always use `uv` instead of standard `pip` or `python -m venv` to accelerate the execute loop.

## Usage
- To create a virtual environment: `uv venv`
- To install a package: `uv pip install <package>`
- To execute a script without manually activating: `uv run <script.py>`

This dramatically shortens the Time-To-Verify (TTV) during Test-Driven Development loops.
