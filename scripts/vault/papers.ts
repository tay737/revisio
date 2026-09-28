/**
 * Vault paper loaders — read the extracted .md transcriptions of exam papers
 * from the Obsidian vault and clean them into plain markdown the app renderer
 * accepts. Shared by the import manifests so every manifest gets identical
 * treatment.
 *
 * The vault notes carry Obsidian frontmatter, `> [!callout]` blocks,
 * `[[wikilinks]]`, and HTML page comments (`<!-- p.3 -->`), none of which the
 * app's markdown renderer understands. cleanPaperMd strips exactly those;
 * everything else (headings, tables, lists, rules, $math$) is kept verbatim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Vault root — extracted paper transcriptions live under these folders. */
export const VAULT = join(process.env.HOME ?? '/Users/tayyabmahmood', 'Documents', 'College', '2026-2027');

export const CM_ASSETS = join(VAULT, 'Core Maths', 'assets');
export const TL_PAPERS = join(VAULT, 'T Level Digital Support and Security', 'Past papers + mark schemes');

/** Read a vault file relative to one of the roots above. */
export function readVault(root: string, ...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

/**
 * Obsidian → app markdown:
 *  1. drop YAML frontmatter (--- … ---) — rendered as junk tables otherwise;
 *  2. rewrite `> [!type] Title` callouts to `> **Title**` blockquotes;
 *  3. unwrap `[[Wikilinks]]` to their visible text;
 *  4. drop HTML comments (`<!-- p.3 -->` page markers);
 *  5. normalise \r\n.
 * Callout *bodies* are preserved — the specimen papers' specimen-material
 * warnings and level descriptors must survive.
 */
export function cleanPaperMd(raw: string): string {
  const noFrontmatter = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return noFrontmatter
    .replace(/\r\n?/g, '\n')
    .replace(/^>\s*\[!\w+\][^\n]*$/gm, (m) => m.replace(/^>\s*\[!\w+\]\s*/, '> **').replace(/$/, '**'))
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (m, target: string) => target.split('/').pop() ?? target)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
