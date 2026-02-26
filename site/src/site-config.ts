import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Clearance Opinion Engine',
  description: 'Deterministic name-availability and clearance-opinion engine',
  logoBadge: 'CO',
  brandName: 'clearance-opinion-engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/clearance-opinion-engine',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/clearance-opinion-engine',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'CLI',
    headline: 'Know before you',
    headlineAccent: 'name.',
    description: 'Check name availability across GitHub, npm, PyPI, domains, and more — then get a conservative clearance opinion backed by evidence and SHA-256 hashes.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: '#features', label: 'See features' },
    previews: [
      { label: 'Install', code: 'npm i -g @mcptoolshop/clearance-opinion-engine' },
      { label: 'Check', code: 'coe check my-cool-tool --radar' },
      { label: 'Output', code: '🟢 GREEN — all namespaces available, no conflicts' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'Features',
      subtitle: 'Deterministic clearance opinions you can trust.',
      features: [
        {
          title: 'Deterministic',
          desc: 'Same inputs always produce byte-identical output. Every check includes SHA-256 evidence hashes and replay verification.',
        },
        {
          title: 'Multi-Namespace',
          desc: 'Checks GitHub orgs/repos, npm, PyPI, crates.io, Docker Hub, Hugging Face, and .com/.dev domains in a single run.',
        },
        {
          title: 'Conservative Opinions',
          desc: 'GREEN / YELLOW / RED tiers with weighted score breakdowns, collision radar, phonetic and homoglyph analysis.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        {
          title: 'Install',
          code: '# Install globally\nnpm i -g @mcptoolshop/clearance-opinion-engine\n\n# Or run with npx\nnpx @mcptoolshop/clearance-opinion-engine check my-tool',
        },
        {
          title: 'Full pipeline',
          code: '# All channels + collision radar + corpus\ncoe check my-cool-tool \\\n  --channels all \\\n  --radar \\\n  --corpus marks.json \\\n  --cache-dir .coe-cache',
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'channels',
      title: 'Supported Channels',
      subtitle: 'Every namespace checked in a single run.',
      columns: ['Channel', 'Namespace', 'Method'],
      rows: [
        ['GitHub', 'Org + Repo', 'REST API (404 = available)'],
        ['npm', 'Package', 'Registry lookup'],
        ['PyPI', 'Package', 'JSON API'],
        ['Domain', '.com / .dev', 'RDAP (RFC 9083)'],
        ['crates.io', 'Crate', 'REST API'],
        ['Docker Hub', 'Repository', 'REST API'],
        ['Hugging Face', 'Model + Space', 'REST API'],
      ],
    },
    {
      kind: 'features',
      id: 'analysis',
      title: 'Deep Analysis',
      subtitle: 'More than just availability checks.',
      features: [
        {
          title: 'Collision Radar',
          desc: 'Searches GitHub, npm, crates.io, and Docker Hub for similar names using fuzzy matching and similarity scoring.',
        },
        {
          title: 'Linguistic Variants',
          desc: 'Generates normalized, tokenized, phonetic (Metaphone), homoglyph, and edit-distance variants to catch confusable names.',
        },
        {
          title: 'Attorney Packet',
          desc: 'Produces a self-contained HTML report with full evidence chain, score breakdown, and clickable reservation links.',
        },
      ],
    },
  ],
};
