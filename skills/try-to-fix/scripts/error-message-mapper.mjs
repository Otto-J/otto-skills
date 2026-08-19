import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const INFERRED_REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const DEFAULT_CONFIG_PATHS = [
  "apps/desktop/src/renderer/config/error-message-mappings.json",
  "apps/cloud-server/src/config/error-message-mappings.json",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMatcher(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function normalizeRule(rule) {
  if (!isRecord(rule) || typeof rule.id !== "string" || !isRecord(rule.messages)) {
    return null;
  }

  const exact = Array.isArray(rule.exact)
    ? rule.exact.map(normalizeMatcher).filter(Boolean)
    : [];
  const keywords = Array.isArray(rule.keywords)
    ? rule.keywords.map(normalizeMatcher).filter(Boolean)
    : [];
  if (exact.length === 0 && keywords.length === 0) return null;

  return {
    id: rule.id.trim(),
    actions: Array.isArray(rule.actions)
      ? rule.actions.filter((action) => typeof action === "string")
      : [],
    exact,
    keywords,
    messages: Object.fromEntries(
      Object.entries(rule.messages)
        .filter(([, message]) => typeof message === "string" && message.trim())
        .map(([locale, message]) => [locale, message.trim()]),
    ),
    sources: Array.isArray(rule.sources)
      ? rule.sources.filter(isRecord).map((source) => ({
        issue: typeof source.issue === "string" ? source.issue : "",
        event: typeof source.event === "string" ? source.event : "",
        observed: Number.isFinite(source.observed) ? source.observed : null,
        url: typeof source.url === "string" ? source.url : "",
      }))
      : [],
  };
}

function parseConfig(value) {
  if (!isRecord(value) || !Array.isArray(value.rules)) return null;
  const rules = value.rules.map(normalizeRule).filter(Boolean);
  if (rules.length === 0) return null;
  return {
    evidence: isRecord(value.evidence) ? value.evidence : null,
    rules,
  };
}

async function readConfig(configPath) {
  const raw = await fs.readFile(configPath, "utf8");
  return parseConfig(JSON.parse(raw));
}

export async function loadErrorMessageMappings(options = {}) {
  const repoRoots = options.repoRoot
    ? [path.resolve(options.repoRoot)]
    : [...new Set([path.resolve(process.cwd()), INFERRED_REPO_ROOT])];
  const candidates = options.configPath
    ? [{ configPath: path.resolve(options.configPath), repoRoot: repoRoots[0] }]
    : repoRoots.flatMap((repoRoot) => DEFAULT_CONFIG_PATHS.map((candidate) => ({
      configPath: path.join(repoRoot, candidate),
      repoRoot,
    })));

  for (const candidate of candidates) {
    try {
      const config = await readConfig(candidate.configPath);
      if (!config) continue;
      return {
        available: true,
        configPath: path.relative(candidate.repoRoot, candidate.configPath).split(path.sep).join("/"),
        evidence: config.evidence,
        rules: config.rules,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return {
    available: false,
    configPath: "",
    evidence: null,
    reason: options.configPath
      ? `无法读取 error-message mapping：${options.configPath}`
      : "当前 checkout 未包含 error-message-mappings.json",
    rules: [],
  };
}

function localizedMessage(messages, locale) {
  if (messages[locale]) return messages[locale];
  const language = String(locale || "").split("-")[0].toLowerCase();
  const languageEntry = Object.entries(messages).find(([key]) => key.toLowerCase() === language);
  return languageEntry?.[1] || messages.en || messages["zh-CN"] || Object.values(messages)[0] || "";
}

export function resolveErrorMessageMapping(rawError, mappingConfig, locale = "zh-CN") {
  if (!mappingConfig?.available) return null;
  const normalizedError = normalizeMatcher(rawError);
  if (!normalizedError) return null;

  for (const rule of mappingConfig.rules) {
    const matched = rule.exact.find((value) => value === normalizedError);
    if (!matched) continue;
    return {
      ruleId: rule.id,
      matchType: "exact",
      matchedValue: matched,
      userMessage: localizedMessage(rule.messages, locale),
      actions: rule.actions,
      sources: rule.sources,
    };
  }

  for (const rule of mappingConfig.rules) {
    const matched = rule.keywords.find((value) => normalizedError.includes(value));
    if (!matched) continue;
    return {
      ruleId: rule.id,
      matchType: "keyword",
      matchedValue: matched,
      userMessage: localizedMessage(rule.messages, locale),
      actions: rule.actions,
      sources: rule.sources,
    };
  }

  return null;
}

export function mapErrorEvidence(rawErrors, mappingConfig, locale = "zh-CN") {
  const results = [];
  const seen = new Set();
  for (const rawError of rawErrors || []) {
    const mapping = resolveErrorMessageMapping(rawError, mappingConfig, locale);
    if (!mapping || seen.has(mapping.ruleId)) continue;
    seen.add(mapping.ruleId);
    results.push({
      ...mapping,
      rawError: String(rawError).slice(0, 500),
    });
  }
  return results;
}
