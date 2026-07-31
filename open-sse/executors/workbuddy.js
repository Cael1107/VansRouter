/**
 * WorkBuddy executor — route chat to WorkBuddy models
 * via workbuddy-proxy (OpenAI-compatible)
 */
import { DefaultExecutor } from "./default.js";
import { normalizeModel } from "../config/models.js";
import { sleep } from "../core/utils.js";
import http from "http";

const WB_API_URL = process.env.WB_API_URL || "http://localhost:51750";
const WB_API_KEY = process.env.WB_API_KEY || "";
const WB_TIMEOUT_MS = parseInt(process.env.WB_TIMEOUT_MS || "90000", 10);

export class WorkBuddyExecutor extends DefaultExecutor {
  constructor(name = "workbuddy", models = []) {
    super(name, {
      models: { "workbuddy-default": () => models.length > 0, default: () => true },
      defaultModel: models[0] || "WorkBuddy/gpt-5.6-sol",
      tokenUrl: `${WB_API_URL}/v1/token`
    });
    this.models = models;
    this.providerName = "workbuddy";
    this.baseUrl = WB_API_URL;
    this.timeout = WB_TIMEOUT_MS;
  }

  getModels() {
    return this.models;
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    return `${WB_API_URL}/v1/chat/completions`;
  }

  buildRequestHeaders(credentials) {
    return {
      "Authorization": `Bearer ${WB_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "VansRouter-WorkBuddy/1.0"
    };
  }
}

export default WorkBuddyExecutor;
