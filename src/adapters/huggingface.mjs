/**
 * Hugging Face adapter for clearance-opinion-engine.
 *
 * Checks model and space name availability via the Hugging Face API.
 * Uses adapter factory pattern for fixture injection.
 *
 * Hugging Face is NOT a flat namespace — models/spaces live under an owner.
 * The --hfOwner flag is required; without it, checks are skipped with
 * COE.HF.OWNER_REQUIRED.
 */

import { checkId, evidenceId } from "../lib/ids.mjs";
import { hashString } from "../lib/hash.mjs";

/**
 * Create a Hugging Face adapter.
 *
 * @param {typeof globalThis.fetch} [fetchFn] - Fetch implementation (injectable for tests)
 * @param {{ version?: string }} [opts]
 * @returns {{ checkModel: Function, checkSpace: Function }}
 */
export function createHuggingFaceAdapter(fetchFn = globalThis.fetch, opts = {}) {
  /**
   * Internal: check a Hugging Face resource (model or space).
   */
  async function _checkResource(type, owner, name, checkOpts) {
    const now = checkOpts.now || new Date().toISOString();
    const nsLabel = type === "model" ? "huggingface_model" : "huggingface_space";
    const id = checkId(nsLabel, owner ? `${owner}-${name}` : name);
    const evId = evidenceId(id, 0);

    // Skip if no owner provided
    if (!owner) {
      return {
        check: {
          id,
          namespace: nsLabel,
          query: { candidateMark: name, value: name },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          details: { source: "huggingface" },
          errors: [
            {
              code: "COE.HF.OWNER_REQUIRED",
              message:
                "Hugging Face requires an owner (org or user). Use --hfOwner <owner> to specify one.",
            },
          ],
        },
        evidence: {
          id: evId,
          type: "skipped",
          source: { system: "huggingface" },
          observedAt: now,
          notes: `Skipped: no Hugging Face owner provided for ${type} check`,
        },
      };
    }

    const apiPath = type === "model" ? "models" : "spaces";
    const url = `https://huggingface.co/api/${apiPath}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
      });
      const bodyText = await res.text();
      const sha256 = hashString(bodyText);

      const status = res.status === 404 ? "available" : res.status === 200 ? "taken" : "unknown";
      const authority = res.status === 404 || res.status === 200 ? "authoritative" : "indicative";

      // Extract metadata when taken
      const details = { source: "huggingface" };
      if (status === "taken") {
        try {
          const data = JSON.parse(bodyText);
          if (data.modelId || data.id) details.resourceId = data.modelId || data.id;
          if (data.downloads !== undefined) details.downloads = data.downloads;
          if (data.likes !== undefined) details.likes = data.likes;
        } catch {
          // Ignore parse errors for details
        }
      }

      return {
        check: {
          id,
          namespace: nsLabel,
          query: { candidateMark: name, value: `${owner}/${name}` },
          status,
          authority,
          observedAt: now,
          evidenceRef: evId,
          details,
          errors: [],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "huggingface", url, method: "GET" },
          observedAt: now,
          sha256,
          bytes: bodyText.length,
          repro: [`curl -s -o /dev/null -w "%{http_code}" "${url}"`],
        },
      };
    } catch (err) {
      return {
        check: {
          id,
          namespace: nsLabel,
          query: { candidateMark: name, value: `${owner}/${name}` },
          status: "unknown",
          authority: "indicative",
          observedAt: now,
          details: { source: "huggingface" },
          errors: [{ code: "COE.ADAPTER.HF_FAIL", message: err.message }],
        },
        evidence: {
          id: evId,
          type: "http_response",
          source: { system: "huggingface", url, method: "GET" },
          observedAt: now,
          notes: `Network error: ${err.message}`,
        },
      };
    }
  }

  /**
   * Check if a Hugging Face model name is available.
   */
  async function checkModel(owner, name, checkOpts = {}) {
    return _checkResource("model", owner, name, checkOpts);
  }

  /**
   * Check if a Hugging Face space name is available.
   */
  async function checkSpace(owner, name, checkOpts = {}) {
    return _checkResource("space", owner, name, checkOpts);
  }

  return { checkModel, checkSpace };
}
