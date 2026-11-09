# Vortex Library - Cobet's Utilities

A support extension for [Vortex](https://www.nexusmods.com/about/vortex/), the mod manager by Nexus Mods. It keeps each mod's information and dependency rules in a `modinfo.json` file stored with the mod, so they survive reinstalls and can be shared, and it adds a **Rules List** editor to the mod details panel.

It works for any game. It is an optional companion to the [EFT - Single Player Tarkov Vortex Extension](https://github.com/CobetcknnKolowski/EFT-Single-Player-Tarkov-Vortex-Extension), which works without it but uses it, when installed, to also save what *Update Mod Information* finds to `modinfo.json`.

---

## Installing

1. Download the `.zip` from the [Releases](../../releases) page.
2. In Vortex, open **Extensions** and use the button in the bottom right to install it from the `.zip` file.
3. Restart Vortex and check that it appears in the Extensions list.

---

## What it adds

### `modinfo.json`

Each mod can have a `modinfo.json` holding its Vortex attributes (name, author, version, category, ...) and its `rules`. It is stored **inside the mod's staging folder**, not deployed to the game:

```
<staging folder>\<mod folder>\Mod Metadata\<mod name>\modinfo.json
```

`<mod name>` is the mod folder's name without anything in `( )` or `{ }`.

- **When a mod is installed**, a `modinfo.json` in its archive is moved into `Mod Metadata` and applied to the mod: its attributes are set, and its rules are added (rules the mod already has are not added twice).
- **Writing** leaves out values that only make sense on one computer (file size, MD5, install time and similar), and sorts the keys so the file is easy to compare.

### Mod details panel

| Entry | What it does |
|---|---|
| **Logical File Name (Vortex Grouping ID)** | edit how Vortex groups versions of the same mod |
| **Rules List** | an editable table of the mod's rules: type (requires, after, before, conflicts), `fileExpression`, `logicalFileName` and `versionMatch`. A rule needs a `fileExpression` or `logicalFileName`; a rule's `idHint` is kept but not shown. Changes apply to Vortex at once and are saved to `modinfo.json`. The table scrolls sideways instead of widening the details panel. |
| **Generate Modinfo File** | write the mod's current attributes and rules to its `modinfo.json` |

It also adds a **Variant** column to the mod table (hidden by default).

### Fallback installer

For archives that contain a `modinfo.json` and that no game extension handles, it provides a simple installer (priority 50): the `modinfo.json` is stored as above and every other file is installed as packed. Game extensions with their own installer can hand the `modinfo.json` to the library instead (see below).

---

## For extension developers

The library registers these calls on `context.api.ext`. Check that a call exists before using it, so your extension still works without the library.

| Call | Returns | Purpose |
|---|---|---|
| `modMetadataRead(gameId, modId, options?)` | `Promise` | Apply the mod's `modinfo.json` to Vortex. `options.replaceRules: true` makes the mod's rules match the file exactly (an empty `rules` array clears them); otherwise only missing rules are added. |
| `modMetadataWrite(gameId, modId, modInfo)` | `Promise<string>` (the file path) | Write `modInfo` (attributes plus an optional `rules` array) to the mod's `modinfo.json`. |
| `modMetadataExcludeAttributes(gameId, keys)` | — | Never write these attribute keys to `modinfo.json` for this game. `rules` can never be excluded. |
| `modMetadataInstallInstructions(files, destinationPath)` | `{instructions, remainingFiles, modName}` | For use inside your installer: the instruction that stores the archive's `modinfo.json`, and the files left for you to place. |

```js
// In a game extension's installer
const staged = context.api.ext.modMetadataInstallInstructions !== undefined
	? await context.api.ext.modMetadataInstallInstructions(files, destinationPath)
	: undefined;

// Saving information, then making Vortex match the file
await context.api.ext.modMetadataWrite(gameId, modId, {...attributes, rules});
await context.api.ext.modMetadataRead(gameId, modId, {replaceRules: true});
```

Every log line from the library starts with `Mod Metadata:`.

---

## FAQ

### How do I use the Rules List?

The **Rules List** is at the bottom of a mod's details panel (select a mod on the **Mods** page). Each row is one of the mod's dependency rules; editing the table changes the rules in Vortex straight away, and saves them to the mod's `modinfo.json`. The round **i** beside the Rules List name shows a short version of this answer.

| Column | What to enter |
|---|---|
| **Type** | `requires`: this mod needs the other mod. `after`: when both mods have the same file, this mod's copy wins. `before`: the other mod's copy wins. `conflicts`: the two mods must not be enabled together. |
| **fileExpression** | The other mod's **archive name**, with `*` as a wildcard. `*~M1219~*` matches any archive whose name contains `~M1219~`. Matching is case-sensitive. |
| **logicalFileName** | The other mod's **Logical File Name** (Vortex Grouping ID), shown in its details panel. An exact match, no wildcards. Give several mods the same Logical File Name and one rule accepts any of them, which helps when more than one mod can satisfy a requirement. When both columns are filled in, Vortex goes by fileExpression. |
| **versionMatch** | Which versions of the other mod count, as a SemVer range: `*` for any, `1.0.8` for exactly that one, `>=1.0.0 <1.2.0` for a range. Left empty, it becomes `*`. |

- **Add Row** adds an empty row. It becomes a rule once fileExpression or logicalFileName has something in it.
- Text changes are applied when you click out of the box; a Type change is applied at once.
- **X** deletes the row and its rule.
- A rule's **idHint** (the exact mod Vortex found for it, when there is one) is not shown, but is kept when you edit the row.

The rules show up in Vortex's **Dependencies** column like any other rule, and Vortex warns you there about rules that are not met. Rules are only checked against **enabled** mods. Without this library, Vortex's own way of making rules still works: drag the dependency icon of one mod onto another, and choose the rule type in the popup.

---

## Feedback

Found a bug? [Open an issue](../../issues) and include the part of the Vortex log (`%APPDATA%\Vortex\vortex.log`) around the problem.
