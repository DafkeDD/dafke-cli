## FiveM / CitizenFX Lua (QBox)

This is a **FiveM** server project: CitizenFX resources written in **Lua 5.4** (`lua54 'yes'`), built on the **QBox (qbx_core)** framework with the **ox** libraries.

### Resource structure
- Each resource has an **`fxmanifest.lua`** (`fx_version 'cerulean'`, `game 'gta5'`, dependencies, script declarations).
- Scripts run in three contexts: **`shared_scripts`** (both sides, e.g. `config.lua`, `@ox_lib/init.lua`), **`client_script`** (game client), **`server_script`** (server).
- Config lives in `config.lua` as a global `Config = {}` table; never hardcode values that belong in config.

### Frameworks & libraries (use these, don't reinvent)
- **qbx_core** — player/framework data: `exports.qbx_core:GetPlayer(src)`, money, jobs, metadata.
- **ox_lib** — UI & utilities: `lib.notify`, `lib.callback` (`register`/`await`), `lib.skillCheck`, `lib.progressBar`, `lib.points`, `lib.zones`.
- **ox_target** — interaction zones/entities.
- **ox_inventory** — items: `exports.ox_inventory:GetItemCount/AddItem/RemoveItem`.
- **oxmysql** — database: `MySQL.query.await`, `MySQL.insert.await` (parameterised queries only).

### Events & callbacks
- Server handlers: `RegisterNetEvent('resource:name', function(...) local src = source ... end)`.
- Client → server: `TriggerServerEvent`. Server → client: `TriggerClientEvent('name', src, ...)`.
- Request/response: `lib.callback.register` (server) + `lib.callback.await` (client).
- Use a consistent **`resourcename:action`** event-naming convention.

### Security — server is authoritative (CRITICAL for RP servers)
- **Never trust the client.** Any value a client sends can be forged. Validate everything server-side.
- Do item/money/permission checks **on the server** with `source` — never decide rewards or removals client-side.
- Verify state server-side before acting (e.g. only hand out loot if the server recorded the hack as complete).
- Never expose secrets, admin logic, or reward tables to the client.
- Guard every `RegisterNetEvent` against missing/invalid args and against players triggering it out of sequence.
- Rate-limit / debounce sensitive net events to resist event spam.

### Tooling
- **Lint:** `luacheck .` with a `.luacheckrc` that whitelists CFX globals (natives, `exports`, `lib`, `Config`, `source`, `CreateThread`, `Wait`, …).
- **Format:** **StyLua** (`stylua .`), configured via `stylua.toml`.
- **LSP / types:** Lua Language Server (LuaLS) with **cfxlua / FiveM natives** definitions and **ox_lib** type defs for autocomplete and diagnostics.
- **No build step** — resources are interpreted by the server.

### Testing & running
- Test **in-game on the FXServer**: add `ensure <resource>` to `server.cfg`, then in the server console use `ensure` / `restart <resource>` / `refresh`.
- Use the server console and `print` / `lib.print` for diagnostics; txAdmin for management.
- Pure, side-effect-free Lua logic can optionally be unit-tested with **busted**, but most gameplay code is validated live.

### Performance
- Avoid tight loops without `Wait()`; never busy-wait. Use `CreateThread` + `Wait` deliberately.
- Cache native results and models; clean up entities/peds/threads you create.
- Prefer `ox_target`/`lib.points`/`lib.zones` over per-frame distance checks.
