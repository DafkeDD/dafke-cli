import { defineCommand } from "citty";

/**
 * Skills command — DEPRECATED.
 * Skills are now managed as Claude Code plugins via the marketplace system.
 */
export default defineCommand({
  meta: {
    name: "skills",
    description: "List available Dafke skills (deprecated — use dafke plugin list)",
  },
  async run() {
    console.error(
      "dafke skills is deprecated. Use `dafke plugin list` instead.\n" +
      "  Install plugins: `dafke plugin install <name>`",
    );
  },
});
