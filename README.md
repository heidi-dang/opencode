<p align="center">
  <a href="https://github.com/heidi-dang/opencode">
    <img src="docs/brand/openhei-logo.svg" alt="OpenHei logo" height="80">
  </a>
</p>

<p align="center">OpenHei: OpenCode derivative with custom branding/doctor gates.</p>

<p align="center">
  <a href="https://discord.gg/openhei"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
</p>

---

### Upstream

[anomalyco/opencode](https://github.com/anomalyco/opencode)

### Installation

```bash
./install --heidi-dang  # OpenHei config (policy + plugin)

npm i -g openhei@latest # or bun/pnpm/yarn
```

### Building from Source

```bash
bun install
bun run dev
```

### Doctor Framework

`python3 tools/doctor.py` (husky pre-commit, quick gates).

`python3 tools/doctor.py --full` before PR (build/test/smoke).

Logs: tools/\_doctor/latest/ (untracked).

### Documentation

[opencode.ai/docs](https://opencode.ai/docs)

### License

MIT [LICENSE](./LICENSE)

**Community**: [Discord](https://discord.gg/openhei)
