# Limitations

This document describes what clearance-opinion-engine does NOT do. Understanding these boundaries is essential for proper use.

## Not Legal Advice

This engine produces an automated namespace-availability opinion. It is not a trademark search, not a legal opinion, and not a substitute for professional trademark counsel. The output explicitly states this in every report.

## No Trademark Database Checks

The engine does NOT query:

- **USPTO** (United States Patent and Trademark Office)
- **EUIPO** (European Union Intellectual Property Office)
- **WIPO** (World Intellectual Property Organization)
- Any national or regional trademark registry

These require API keys, registration, or paid access and are planned for a future phase.

## Domain Coverage

- Domain checks use **RDAP** (RFC 9083) via the `rdap.org` bootstrap service
- Default TLDs: `.com` and `.dev` only
- RDAP covers ~87% of TLDs globally (96% of gTLDs, 53% of ccTLDs)
- Some country-code TLDs may not respond to RDAP queries
- Domain availability is a point-in-time check — registration status can change

## No Social Media Handle Checks

The engine does not check availability of handles on:

- Twitter/X, Instagram, Facebook, LinkedIn
- YouTube, TikTok, Reddit
- Any social media platform

## No Common-Law Trademark Analysis

The engine does not search for:

- Existing use of the name in commerce (web search)
- App store listings (Apple App Store, Google Play)
- Business name registrations
- DBA filings

## Phonetic Analysis Limitations

- Uses the Metaphone algorithm, which is **English-centric**
- May not detect phonetic similarities in other languages
- Homoglyph detection covers common ASCII confusables only
- Does not detect semantic similarity (different words with same meaning)

## Point-in-Time Checks

All namespace checks are point-in-time snapshots. Between the check and any action you take:

- A namespace could be claimed by someone else
- A previously taken namespace could become available
- Registry policies could change

## Determinism Scope

The determinism guarantee ("same inputs + same adapter responses = byte-identical output") applies only when:

1. The same engine version is used
2. The same adapter responses are provided (via fixture injection or identical network state)
3. The same clock value is injected (or the same `now` parameter is passed)

Different engine versions may produce different output for the same inputs due to scoring algorithm changes, template updates, or new fields.
