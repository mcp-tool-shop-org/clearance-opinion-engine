/**
 * Phonetic encoding for clearance-opinion-engine.
 *
 * Pure-JS Metaphone implementation (no external deps).
 * Used to detect phonetic conflicts between candidate names.
 */

/**
 * Compute the Metaphone code for a single word.
 *
 * This is a simplified Metaphone algorithm that handles the most common
 * English phonetic transformations. It produces a consonant-skeleton code.
 *
 * @param {string} word - A single word (letters only)
 * @returns {string} The Metaphone code (uppercase)
 */
export function metaphone(word) {
  if (!word || typeof word !== "string") return "";

  let w = word.toUpperCase();

  // Drop non-alpha
  w = w.replace(/[^A-Z]/g, "");
  if (w.length === 0) return "";

  // Drop initial silent letters
  if (/^(AE|GN|KN|PN|WR)/.test(w)) {
    w = w.slice(1);
  }

  let code = "";
  let i = 0;

  while (i < w.length && code.length < 6) {
    const c = w[i];
    const next = w[i + 1] || "";
    const prev = i > 0 ? w[i - 1] : "";

    // Skip duplicate adjacent letters (except C)
    if (c === prev && c !== "C") {
      i++;
      continue;
    }

    switch (c) {
      case "A":
      case "E":
      case "I":
      case "O":
      case "U":
        // Only encode vowels at the beginning
        if (i === 0) code += c;
        break;

      case "B":
        // Drop B after M at end of word
        if (prev !== "M" || i !== w.length - 1) code += "B";
        break;

      case "C":
        if (next === "H") {
          code += "X";
          i++; // skip H
        } else if ("EIY".includes(next)) {
          code += "S";
        } else {
          code += "K";
        }
        break;

      case "D":
        if (next === "G" && "EIY".includes(w[i + 2] || "")) {
          code += "J";
          i++; // skip G
        } else {
          code += "T";
        }
        break;

      case "F":
        code += "F";
        break;

      case "G":
        if (next === "H" && i + 2 < w.length && !"AEIOU".includes(w[i + 2] || "")) {
          // GH not before a vowel — silent
          i++;
        } else if (i > 0 && next === "N" && (i + 2 >= w.length || (next === "N" && i + 2 >= w.length))) {
          // GN at end — silent G
        } else if (prev === "G") {
          // skip double G (handled by duplicate check mostly)
        } else if ("EIY".includes(next)) {
          code += "J";
        } else {
          code += "K";
        }
        break;

      case "H":
        // H before a vowel and not after CSPTG
        if ("AEIOU".includes(next) && !"CSPTG".includes(prev)) {
          code += "H";
        }
        break;

      case "J":
        code += "J";
        break;

      case "K":
        if (prev !== "C") code += "K";
        break;

      case "L":
        code += "L";
        break;

      case "M":
        code += "M";
        break;

      case "N":
        code += "N";
        break;

      case "P":
        if (next === "H") {
          code += "F";
          i++; // skip H
        } else {
          code += "P";
        }
        break;

      case "Q":
        code += "K";
        break;

      case "R":
        code += "R";
        break;

      case "S":
        if (next === "H" || (next === "I" && "AO".includes(w[i + 2] || ""))) {
          code += "X";
          if (next === "H") i++;
        } else if (next === "C" && w[i + 2] === "H") {
          code += "SK";
          i += 2;
        } else {
          code += "S";
        }
        break;

      case "T":
        if (next === "H") {
          code += "0"; // Use 0 for "th" sound
          i++; // skip H
        } else if (next === "I" && "AO".includes(w[i + 2] || "")) {
          code += "X";
        } else {
          code += "T";
        }
        break;

      case "V":
        code += "F";
        break;

      case "W":
      case "Y":
        if ("AEIOU".includes(next)) {
          code += c;
        }
        break;

      case "X":
        code += "KS";
        break;

      case "Z":
        code += "S";
        break;

      default:
        break;
    }

    i++;
  }

  return code;
}

/**
 * Generate phonetic codes for an array of tokens.
 *
 * @param {string[]} tokens - Array of word tokens
 * @returns {string[]} Array of Metaphone codes (one per token)
 */
export function phoneticVariants(tokens) {
  return tokens.map(metaphone).filter(Boolean);
}

/**
 * Generate a combined phonetic signature for a name's tokens.
 *
 * @param {string[]} tokens
 * @returns {string} Space-separated Metaphone codes
 */
export function phoneticSignature(tokens) {
  return phoneticVariants(tokens).join(" ");
}
