#!/usr/bin/env node

import crypto from "node:crypto";

const HOST = "dnspod.tencentcloudapi.com";
const SERVICE = "dnspod";
const VERSION = "2021-03-23";
const ENDPOINT = `https://${HOST}`;

function usage(exitCode = 0) {
  const text = `
Usage:
  node dnspod.mjs domains [--limit 100]
  node dnspod.mjs list --domain example.com [--subdomain www] [--type A] [--line 默认]
  node dnspod.mjs create --domain example.com --subdomain www --type A --value 1.2.3.4 [--ttl 600] [--line 默认]
  node dnspod.mjs update --domain example.com --record-id 123 --subdomain www --type A --value 1.2.3.4 [--ttl 600] [--line 默认]
  node dnspod.mjs upsert --domain example.com --subdomain www --type A --value 1.2.3.4 [--ttl 600] [--line 默认]

Environment:
  DNSPOD_ID   Tencent Cloud SecretID
  DNSPOD_KEY  Tencent Cloud SecretKey
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function requireOption(args, name) {
  const value = args[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required option: --${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  }
  return value;
}

function optionalInt(args, name) {
  if (args[name] === undefined) return undefined;
  const value = Number.parseInt(args[name], 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid integer for --${name}: ${args[name]}`);
  }
  return value;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function utcDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

async function request(action, params = {}) {
  const secretId = requireEnv("DNSPOD_ID");
  const secretKey = requireEnv("DNSPOD_KEY");
  const timestamp = Math.floor(Date.now() / 1000);
  const date = utcDate(timestamp);
  const payload = JSON.stringify(params);
  const contentType = "application/json; charset=utf-8";
  const signedHeaders = "content-type;host";
  const canonicalHeaders = `content-type:${contentType}\nhost:${HOST}\n`;
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmac(secretSigning, stringToSign, "hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: HOST,
      "X-TC-Action": action,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": VERSION,
    },
    body: payload,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  if (data.Response?.Error) {
    const err = data.Response.Error;
    throw new Error(`${err.Code}: ${err.Message} (RequestId: ${data.Response.RequestId ?? "unknown"})`);
  }
  return data.Response;
}

function baseRecordParams(args) {
  const params = {
    Domain: requireOption(args, "domain"),
    RecordType: requireOption(args, "type").toUpperCase(),
    RecordLine: args.line ?? "默认",
    Value: requireOption(args, "value"),
  };
  params.SubDomain = args.subdomain ?? "@";
  const ttl = optionalInt(args, "ttl");
  const mx = optionalInt(args, "mx");
  const weight = optionalInt(args, "weight");
  if (ttl !== undefined) params.TTL = ttl;
  if (mx !== undefined) params.MX = mx;
  if (weight !== undefined) params.Weight = weight;
  if (args.status) params.Status = String(args.status).toUpperCase();
  if (args.remark !== undefined) params.Remark = String(args.remark);
  if (args.lineId !== undefined) params.RecordLineId = String(args.lineId);
  return params;
}

async function domains(args) {
  const limit = optionalInt(args, "limit") ?? 100;
  const offset = optionalInt(args, "offset") ?? 0;
  return request("DescribeDomainList", { Limit: limit, Offset: offset });
}

async function list(args) {
  const params = {
    Domain: requireOption(args, "domain"),
    Limit: optionalInt(args, "limit") ?? 3000,
    Offset: optionalInt(args, "offset") ?? 0,
    ErrorOnEmpty: args.errorOnEmpty ?? "no",
  };
  if (args.subdomain !== undefined) params.Subdomain = String(args.subdomain);
  if (args.type !== undefined) params.RecordType = String(args.type).toUpperCase();
  if (args.line !== undefined) params.RecordLine = String(args.line);
  if (args.lineId !== undefined) params.RecordLineId = String(args.lineId);
  if (args.keyword !== undefined) params.Keyword = String(args.keyword);
  return request("DescribeRecordList", params);
}

async function create(args) {
  return request("CreateRecord", baseRecordParams(args));
}

async function update(args) {
  const params = baseRecordParams(args);
  params.RecordId = optionalInt(args, "recordId");
  if (params.RecordId === undefined) {
    throw new Error("Missing required option: --record-id");
  }
  return request("ModifyRecord", params);
}

function findMatchingRecord(records, args) {
  const subdomain = args.subdomain ?? "@";
  const type = requireOption(args, "type").toUpperCase();
  const line = args.line ?? "默认";
  const lineId = args.lineId;
  return records.filter((record) => {
    const sameName = record.Name === subdomain;
    const sameType = record.Type === type;
    const sameLine = lineId !== undefined ? String(record.LineId) === String(lineId) : record.Line === line;
    return sameName && sameType && sameLine;
  });
}

async function upsert(args) {
  const current = await list({
    domain: requireOption(args, "domain"),
    subdomain: args.subdomain ?? "@",
    type: requireOption(args, "type"),
    line: args.line,
    lineId: args.lineId,
    errorOnEmpty: "no",
    limit: 3000,
  });
  const matches = findMatchingRecord(current.RecordList ?? [], args);
  if (matches.length === 0) {
    const created = await create(args);
    return { Mode: "created", ...created };
  }
  if (matches.length > 1) {
    const ids = matches.map((record) => record.RecordId).join(", ");
    throw new Error(`Matched multiple records (${ids}). Use update --record-id for an exact update.`);
  }
  const existing = matches[0];
  const updateArgs = {
    ...args,
    recordId: existing.RecordId,
    subdomain: args.subdomain ?? existing.Name,
    type: args.type ?? existing.Type,
    line: args.line ?? existing.Line,
    ttl: args.ttl ?? existing.TTL,
    mx: args.mx ?? existing.MX,
    status: args.status ?? existing.Status,
  };
  const updated = await update(updateArgs);
  return { Mode: "updated", PreviousValue: existing.Value, ...updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) usage(0);
  const command = args._[0];
  if (!command) usage(1);

  const handlers = { domains, list, create, update, upsert };
  const handler = handlers[command];
  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }
  const result = await handler(args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
